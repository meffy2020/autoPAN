var KIOSK_MAX_DAILY_GAME_MINUTES_ = 120;
var KIOSK_GAME_RESOURCE_TYPES_ = ["pc", "nintendo", "playstation"];
var KIOSK_GAME_SEGMENT_CURSOR_PROPERTY_ = "KIOSK_GAME_TODAY_SEGMENTS";
var KIOSK_GAME_SEGMENT_CURSOR_MAX_AGE_MS_ = 36 * 60 * 60 * 1000;
var KIOSK_GAME_SEGMENT_CURSOR_FUTURE_SKEW_MS_ = 5 * 60 * 1000;

function doPost(event) {
  var payload = {};
  var requestStartedAt = Date.now();
  var timing = {};

  try {
    payload = JSON.parse((event.postData && event.postData.contents) || "{}");
    var result = writeKioskSubmission_(payload, timing);
    timing.totalMs = Date.now() - requestStartedAt;

    console.log(
      JSON.stringify({
        event: "kiosk_lock_write",
        tabName: payload.tabName,
        resourceType: payload.resourceType,
        todayLabel: payload.todayLabel,
        rowNumber: result.rowNumber,
        timing: timing,
      }),
    );

    return json_({
      ok: true,
      rowNumber: result.rowNumber,
      tabName: payload.tabName,
      timing: timing,
    });
  } catch (error) {
    timing.totalMs = Date.now() - requestStartedAt;
    console.error(
      JSON.stringify({
        event: "kiosk_lock_write_failed",
        tabName: payload.tabName,
        resourceType: payload.resourceType,
        todayLabel: payload.todayLabel,
        error: error && error.message ? error.message : String(error),
        timing: timing,
      }),
    );

    return json_({
      ok: false,
      error: error && error.message ? error.message : String(error),
      timing: timing,
    });
  }
}

function writeKioskSubmission_(payload, timing) {
  var properties = PropertiesService.getScriptProperties();
  var expectedSecret = properties.getProperty("KIOSK_APPEND_SECRET");
  var expectedSpreadsheetId = properties.getProperty("KIOSK_SPREADSHEET_ID");

  if (!expectedSecret || payload.secret !== expectedSecret) {
    throw new Error("Unauthorized kiosk sheet write.");
  }

  if (!expectedSpreadsheetId) {
    throw new Error("KIOSK_SPREADSHEET_ID script property is required.");
  }

  if (
    payload.spreadsheetId !== expectedSpreadsheetId ||
    !payload.tabName ||
    !payload.todayLabel
  ) {
    throw new Error("Invalid kiosk sheet write target.");
  }

  var expectedTabName = getAllowedTabName_(properties, payload.resourceType);

  if (!expectedTabName || payload.tabName !== expectedTabName) {
    throw new Error("Invalid kiosk resource tab.");
  }

  if (!Array.isArray(payload.row) || payload.row.length !== 17) {
    throw new Error("Invalid kiosk sheet row.");
  }

  var isGameSubmission = isGameResourceType_(payload.resourceType);

  if (isGameSubmission) {
    validateGameLimitPayload_(payload.gameLimit);
  }

  // Opening the document and resolving tabs do not belong in the critical section.
  var spreadsheet = SpreadsheetApp.openById(expectedSpreadsheetId);
  var targetSheet = spreadsheet.getSheetByName(expectedTabName);

  if (!targetSheet) {
    throw new Error("Kiosk sheet tab not found: " + expectedTabName);
  }

  var gameSheets = {};

  if (isGameSubmission) {
    KIOSK_GAME_RESOURCE_TYPES_.forEach(function (resourceType) {
      var tabName = getAllowedTabName_(properties, resourceType);
      var sheet = spreadsheet.getSheetByName(tabName);

      if (!sheet) {
        throw new Error("Kiosk sheet tab not found: " + tabName);
      }

      gameSheets[resourceType] = sheet;
    });
  }

  // One spreadsheet-wide lock keeps the limit check and row write atomic.
  var lock = LockService.getDocumentLock() || LockService.getScriptLock();
  var lockStartedAt = Date.now();
  lock.waitLock(20000);
  timing.lockWaitMs = Date.now() - lockStartedAt;

  try {
    var segmentsByResourceType = {};

    if (isGameSubmission) {
      var policyStartedAt = Date.now();
      var usage = readDailyGameUsageInsideLock_(
        properties,
        gameSheets,
        payload.todayLabel,
        payload.gameLimit,
      );
      timing.policyReadMs = Date.now() - policyStartedAt;
      timing.gameSegmentCursorHits = usage.cursorHits;
      segmentsByResourceType = usage.segmentsByResourceType;
      assertDailyGameLimit_(usage.minutes, payload.gameLimit.requestedMinutes);
    }

    var scanStartedAt = Date.now();
    var rowResolution =
      payload.resourceType === "space"
        ? findSpaceInsertRowWithCursor_(
            properties,
            targetSheet,
            payload.todayLabel,
          )
        : {
            rowIndex: findSheetInsertRowIndexFromSheet_(
              targetSheet,
              payload.resourceType,
              payload.todayLabel,
              segmentsByResourceType[payload.resourceType],
            ),
            cursorHit: false,
          };
    var rowIndex = rowResolution.rowIndex;
    timing.scanMs = Date.now() - scanStartedAt;
    timing.cursorHit = rowResolution.cursorHit ? 1 : 0;

    var writeStartedAt = Date.now();
    var targetRange =
      rowResolution.targetRange ||
      targetSheet.getRange(rowIndex + 1, 2, 1, 17);
    writeSubmissionRow_(
      targetRange,
      payload.row,
      rowResolution.currentValues,
      rowResolution.currentFormulas,
    );
    timing.writeMs = Date.now() - writeStartedAt;

    if (payload.resourceType === "space") {
      saveSpaceNextRowCursor_(
        properties,
        payload.todayLabel,
        rowResolution.todayRowNumber,
        rowIndex + 2,
      );
    }

    return { rowNumber: rowIndex + 1 };
  } finally {
    lock.releaseLock();
  }
}

function getAllowedTabName_(properties, resourceType) {
  var defaults = {
    pc: "컴퓨터",
    nintendo: "닌텐도",
    playstation: "플스",
    space: "무료콘텐츠",
  };
  var propertyNames = {
    pc: "KIOSK_PC_TAB_NAME",
    nintendo: "KIOSK_NINTENDO_TAB_NAME",
    playstation: "KIOSK_PLAYSTATION_TAB_NAME",
    space: "KIOSK_FREE_TAB_NAME",
  };
  var propertyName = propertyNames[resourceType];

  if (!propertyName) {
    return "";
  }

  return properties.getProperty(propertyName) || defaults[resourceType];
}

function isGameResourceType_(resourceType) {
  return KIOSK_GAME_RESOURCE_TYPES_.indexOf(resourceType) >= 0;
}

function validateGameLimitPayload_(gameLimit) {
  if (
    !gameLimit ||
    !gameLimit.memberName ||
    !normalizePhone_(gameLimit.guardianPhone) ||
    !Number.isFinite(Number(gameLimit.requestedMinutes)) ||
    Number(gameLimit.requestedMinutes) <= 0 ||
    !Array.isArray(gameLimit.pricingRules) ||
    gameLimit.pricingRules.length === 0
  ) {
    throw new Error("Invalid daily game limit policy.");
  }
}

function readDailyGameUsageInsideLock_(
  properties,
  gameSheets,
  todayLabel,
  gameLimit
) {
  var segmentsByResourceType = {};
  var cursor = readGameTodaySegmentsCursor_(properties, todayLabel);
  var repairedCursorSegments = {};
  var cursorHits = 0;
  var shouldRepairCursor = !cursor;

  KIOSK_GAME_RESOURCE_TYPES_.forEach(function (resourceType) {
    var segment = null;
    var cachedSegment =
      cursor && cursor.segments ? cursor.segments[resourceType] : null;

    if (cachedSegment) {
      try {
        segment = readTodaySegmentFromGameCursor_(
          gameSheets[resourceType],
          todayLabel,
          cachedSegment,
        );
        cursorHits += 1;
      } catch (error) {
        shouldRepairCursor = true;
        console.warn(
          "Saved game segment cursor could not be read; falling back to scan.",
        );
      }
    } else {
      shouldRepairCursor = true;
    }

    if (!segment) {
      // A game tab can legitimately have no entry for today (for example,
      // PlayStation on a day nobody has used it yet). It contributes zero
      // minutes to the cross-game daily limit, rather than blocking PC or
      // Nintendo intake. The selected tab is still required below when we
      // resolve the row to write.
      segment = findTodaySegmentFromSheet_(
        gameSheets[resourceType],
        todayLabel,
      );
    }

    segmentsByResourceType[resourceType] = segment;

    var repairedSegment = buildGameSegmentCursor_(segment);

    if (repairedSegment) {
      repairedCursorSegments[resourceType] = repairedSegment;
    }
  });

  if (shouldRepairCursor) {
    saveGameTodaySegmentsCursor_(
      properties,
      todayLabel,
      repairedCursorSegments,
    );
  }

  return {
    minutes: getDailyGameMinutesFromSegments_(
      segmentsByResourceType,
      gameLimit,
    ),
    segmentsByResourceType: segmentsByResourceType,
    cursorHits: cursorHits,
  };
}

function readGameTodaySegmentsCursor_(properties, todayLabel) {
  var rawCursor = properties.getProperty(
    KIOSK_GAME_SEGMENT_CURSOR_PROPERTY_,
  );

  if (!rawCursor) {
    return null;
  }

  try {
    var cursor = JSON.parse(rawCursor);
    var savedAtMs = Number(cursor && cursor.savedAtMs);
    var nowMs = Date.now();

    if (
      !cursor ||
      cursor.version !== 1 ||
      cursor.todayLabel !== todayLabel ||
      !cursor.segments ||
      typeof cursor.segments !== "object" ||
      !Number.isFinite(savedAtMs) ||
      savedAtMs > nowMs + KIOSK_GAME_SEGMENT_CURSOR_FUTURE_SKEW_MS_ ||
      nowMs - savedAtMs > KIOSK_GAME_SEGMENT_CURSOR_MAX_AGE_MS_
    ) {
      return null;
    }

    return cursor;
  } catch (error) {
    return null;
  }
}

function readTodaySegmentFromGameCursor_(sheet, todayLabel, cursorSegment) {
  var todayRowNumber = Number(cursorSegment && cursorSegment.todayRowNumber);
  var segmentEndRowNumber = Number(
    cursorSegment && cursorSegment.segmentEndRowNumber,
  );
  var savedLastRow = Number(cursorSegment && cursorSegment.lastRow);

  if (
    !Number.isInteger(todayRowNumber) ||
    todayRowNumber < 1 ||
    !Number.isInteger(segmentEndRowNumber) ||
    segmentEndRowNumber <= todayRowNumber ||
    !Number.isInteger(savedLastRow) ||
    savedLastRow < segmentEndRowNumber
  ) {
    throw new Error("Saved game segment cursor is stale.");
  }

  var lastRow = sheet.getLastRow();

  if (lastRow !== savedLastRow || segmentEndRowNumber > lastRow) {
    throw new Error("Saved game segment cursor is stale.");
  }

  var rowCountWithBoundary = segmentEndRowNumber - todayRowNumber + 1;
  var rowsWithBoundary = sheet
    .getRange(todayRowNumber, 1, rowCountWithBoundary, 18)
    .getDisplayValues();

  if (!isGameSegmentCursorRangeValid_(rowsWithBoundary, todayLabel)) {
    throw new Error("Saved game segment cursor crossed a sheet boundary.");
  }

  var segmentRows = rowsWithBoundary.slice(0, rowsWithBoundary.length - 1);

  return {
    todayRowIndex: todayRowNumber - 1,
    segmentEndRowNumber: segmentEndRowNumber,
    lastRow: lastRow,
    hasExplicitBoundary: true,
    segmentLabels: segmentRows.map(function (row) {
      return [cell_(row, 0)];
    }),
    intakeRows: segmentRows.map(function (row) {
      return row.slice(1, 18);
    }),
  };
}

function isGameSegmentCursorRangeValid_(rowsWithBoundary, todayLabel) {
  if (
    rowsWithBoundary.length < 2 ||
    cell_(rowsWithBoundary[0], 0) !== todayLabel
  ) {
    return false;
  }

  for (var index = 1; index < rowsWithBoundary.length - 1; index += 1) {
    var label = cell_(rowsWithBoundary[index], 0);

    if (label.indexOf("마감") === 0 || isSheetDateLabel_(label)) {
      return false;
    }
  }

  var boundaryLabel = cell_(
    rowsWithBoundary[rowsWithBoundary.length - 1],
    0,
  );

  return (
    boundaryLabel !== todayLabel &&
    (boundaryLabel.indexOf("마감") === 0 ||
      isSheetDateLabel_(boundaryLabel))
  );
}

function buildGameSegmentCursor_(segment) {
  if (
    !segment ||
    !segment.hasExplicitBoundary ||
    !Number.isInteger(segment.todayRowIndex) ||
    !Number.isInteger(segment.segmentEndRowNumber) ||
    !Number.isInteger(segment.lastRow)
  ) {
    return null;
  }

  return {
    todayRowNumber: segment.todayRowIndex + 1,
    segmentEndRowNumber: segment.segmentEndRowNumber,
    lastRow: segment.lastRow,
  };
}

function saveGameTodaySegmentsCursor_(properties, todayLabel, segments) {
  if (!properties || typeof properties.setProperty !== "function") {
    return;
  }

  try {
    properties.setProperty(
      KIOSK_GAME_SEGMENT_CURSOR_PROPERTY_,
      JSON.stringify({
        version: 1,
        todayLabel: todayLabel,
        savedAtMs: Date.now(),
        segments: segments,
      }),
    );
  } catch (error) {
    console.warn(
      "Game usage read succeeded but its segment cursor could not be saved.",
    );
  }
}

function getDailyGameMinutesFromSegments_(segmentsByResourceType, gameLimit) {
  var targetName = normalizeSearch_(gameLimit.memberName);
  var targetPhone = normalizePhone_(gameLimit.guardianPhone);
  var minutes = 0;

  KIOSK_GAME_RESOURCE_TYPES_.forEach(function (resourceType) {
    var segment = segmentsByResourceType[resourceType];
    var intakeRows = segment ? segment.intakeRows : [];
    var amountIndex = resourceType === "pc" ? 15 : 16;

    intakeRows.forEach(function (row) {
      if (
        normalizeSearch_(cell_(row, 1)) !== targetName ||
        normalizePhone_(cell_(row, 13)) !== targetPhone
      ) {
        return;
      }

      var amount = parseAmount_(cell_(row, amountIndex));
      minutes += amountToGameMinutes_(
        resourceType,
        amount,
        gameLimit.pricingRules,
      );
    });
  });

  return minutes;
}

function amountToGameMinutes_(resourceType, amount, pricingRules) {
  if (amount <= 0) {
    return 0;
  }

  var matchingMinutes = 0;

  pricingRules.forEach(function (rule) {
    if (
      rule.resourceType === resourceType &&
      Number(rule.amount) === amount
    ) {
      matchingMinutes = Math.max(matchingMinutes, Number(rule.minutes) || 0);
    }
  });

  if (matchingMinutes > 0) {
    return matchingMinutes;
  }

  return Math.max(Math.round(amount / 500) * 30, 0);
}

function assertDailyGameLimit_(usedMinutes, requestedMinutes) {
  if (
    usedMinutes + Number(requestedMinutes) <=
    KIOSK_MAX_DAILY_GAME_MINUTES_
  ) {
    return;
  }

  var remainingMinutes = Math.max(
    KIOSK_MAX_DAILY_GAME_MINUTES_ - usedMinutes,
    0,
  );

  if (remainingMinutes <= 0) {
    throw new Error("오늘 이용 시간이 부족해요.");
  }

  throw new Error(
    "컴퓨터·닌텐도·플스는 하루 2시간까지만 이용할 수 있어요. 오늘 남은 시간은 " +
      remainingMinutes +
      "분이라 선택한 시간으로는 접수할 수 없어요.",
  );
}

function findTodaySegmentFromSheet_(sheet, todayLabel) {
  var lastRow = sheet.getLastRow();

  if (lastRow < 1) {
    return null;
  }

  var dateRows = sheet.getRange(1, 1, lastRow, 1).getDisplayValues();
  var todayRowIndex = -1;

  for (var index = dateRows.length - 1; index >= 0; index -= 1) {
    if (cell_(dateRows[index], 0) === todayLabel) {
      todayRowIndex = index;
      break;
    }
  }

  if (todayRowIndex < 0) {
    return null;
  }

  var segmentEndIndex = dateRows.length;

  for (
    var nextIndex = todayRowIndex + 1;
    nextIndex < dateRows.length;
    nextIndex += 1
  ) {
    var firstCell = cell_(dateRows[nextIndex], 0);

    if (firstCell.indexOf("마감") === 0 || isSheetDateLabel_(firstCell)) {
      segmentEndIndex = nextIndex;
      break;
    }
  }

  var segmentRowCount = segmentEndIndex - todayRowIndex;
  var intakeRows = sheet
    .getRange(todayRowIndex + 1, 2, segmentRowCount, 17)
    .getDisplayValues();

  return {
    todayRowIndex: todayRowIndex,
    segmentEndRowNumber: segmentEndIndex + 1,
    lastRow: lastRow,
    hasExplicitBoundary: segmentEndIndex < dateRows.length,
    dateRows: dateRows,
    segmentLabels: dateRows.slice(todayRowIndex, segmentEndIndex),
    intakeRows: intakeRows,
  };
}

function readTodaySegmentFromSheet_(sheet, todayLabel) {
  var segment = findTodaySegmentFromSheet_(sheet, todayLabel);

  if (!segment) {
    throw new Error(todayLabel + " date row not found.");
  }

  return segment;
}

function findSheetInsertRowIndexFromSheet_(
  sheet,
  resourceType,
  todayLabel,
  preparedSegment
) {
  var segment =
    preparedSegment || readTodaySegmentFromSheet_(sheet, todayLabel);

  for (var offset = 0; offset < segment.intakeRows.length; offset += 1) {
    var rowIndex = segment.todayRowIndex + offset;
    var segmentLabel = segment.segmentLabels
      ? segment.segmentLabels[offset]
      : segment.dateRows[rowIndex];
    var row = [cell_(segmentLabel, 0)].concat(
      segment.intakeRows[offset] || [],
    );

    if (isWritableSubmissionRow_(row, resourceType)) {
      return rowIndex;
    }
  }

  throw new Error(todayLabel + " segment has no writable kiosk row.");
}

function findSpaceInsertRowWithCursor_(properties, sheet, todayLabel) {
  var cursor = readSpaceNextRowCursor_(properties, todayLabel);

  if (cursor) {
    try {
      var labelRowCount = cursor.rowNumber - cursor.todayRowNumber + 1;
      var segmentLabels = sheet
        .getRange(cursor.todayRowNumber, 1, labelRowCount, 1)
        .getDisplayValues();

      if (!isSpaceCursorInsideTodaySegment_(segmentLabels, todayLabel)) {
        throw new Error("Saved cursor crossed a kiosk segment boundary.");
      }

      var targetRange = sheet.getRange(cursor.rowNumber, 2, 1, 17);
      var currentValues = targetRange.getValues()[0] || [];
      var currentFormulas = targetRange.getFormulas()[0] || [];
      var cursorRow = [cell_(segmentLabels[segmentLabels.length - 1], 0)].concat(
        currentValues,
      );

      if (isWritableCursorRow_(cursorRow, "space", todayLabel)) {
        return {
          rowIndex: cursor.rowNumber - 1,
          cursorHit: true,
          todayRowNumber: cursor.todayRowNumber,
          targetRange: targetRange,
          currentValues: currentValues,
          currentFormulas: currentFormulas,
        };
      }
    } catch (error) {
      console.warn(
        "Saved kiosk next-row cursor could not be read; falling back to scan.",
      );
    }
  }

  var segment = readTodaySegmentFromSheet_(sheet, todayLabel);

  return {
    rowIndex: findSheetInsertRowIndexFromSheet_(
      sheet,
      "space",
      todayLabel,
      segment,
    ),
    cursorHit: false,
    todayRowNumber: segment.todayRowIndex + 1,
  };
}

function readSpaceNextRowCursor_(properties, todayLabel) {
  var rawCursor = properties.getProperty("KIOSK_NEXT_ROW_SPACE");

  if (!rawCursor) {
    return null;
  }

  try {
    var cursor = JSON.parse(rawCursor);
    var todayRowNumber = Number(cursor && cursor.todayRowNumber);
    var rowNumber = Number(cursor && cursor.rowNumber);

    if (
      !cursor ||
      cursor.todayLabel !== todayLabel ||
      !Number.isInteger(todayRowNumber) ||
      todayRowNumber < 1 ||
      !Number.isInteger(rowNumber) ||
      rowNumber < todayRowNumber
    ) {
      return null;
    }

    return {
      todayRowNumber: todayRowNumber,
      rowNumber: rowNumber,
    };
  } catch (error) {
    return null;
  }
}

function saveSpaceNextRowCursor_(
  properties,
  todayLabel,
  todayRowNumber,
  rowNumber
) {
  try {
    properties.setProperty(
      "KIOSK_NEXT_ROW_SPACE",
      JSON.stringify({
        todayLabel: todayLabel,
        todayRowNumber: todayRowNumber,
        rowNumber: rowNumber,
      }),
    );
  } catch (error) {
    console.warn(
      "Kiosk write succeeded but the next-row cursor could not be saved.",
    );
  }
}

function isSpaceCursorInsideTodaySegment_(segmentLabels, todayLabel) {
  if (!segmentLabels.length || cell_(segmentLabels[0], 0) !== todayLabel) {
    return false;
  }

  for (var index = 1; index < segmentLabels.length; index += 1) {
    var label = cell_(segmentLabels[index], 0);

    if (label.indexOf("마감") === 0 || isSheetDateLabel_(label)) {
      return false;
    }
  }

  return true;
}

function isWritableCursorRow_(row, resourceType, todayLabel) {
  var firstCell = cell_(row, 0);

  if (firstCell && firstCell !== todayLabel) {
    return false;
  }

  return isWritableSubmissionRow_(row, resourceType);
}

function writeSubmissionRow_(
  range,
  submittedValues,
  preparedValues,
  preparedFormulas
) {
  var currentValues = Array.isArray(preparedValues)
    ? preparedValues
    : range.getValues()[0] || [];
  var currentFormulas = Array.isArray(preparedFormulas)
    ? preparedFormulas
    : range.getFormulas()[0] || [];
  var mergedValues = mergeSubmissionRow_(
    currentValues,
    currentFormulas,
    submittedValues,
  );

  range.setValues([mergedValues]);
}

function mergeSubmissionRow_(
  currentValues,
  currentFormulas,
  submittedValues
) {
  return submittedValues.map(function (value, index) {
    if (value !== null && value !== undefined) {
      return value;
    }

    if (currentFormulas[index]) {
      return currentFormulas[index];
    }

    return currentValues[index] == null ? "" : currentValues[index];
  });
}

function isWritableSubmissionRow_(row, resourceType) {
  if (cell_(row, 0).indexOf("마감") === 0) {
    return false;
  }

  var hasSpaceMarkerOnly =
    resourceType === "space" &&
    normalizeSearch_(cell_(row, 15)) === "공간이용";

  for (var index = 1; index <= 17; index += 1) {
    if (hasSpaceMarkerOnly && index === 15) {
      continue;
    }

    if (cell_(row, index)) {
      return false;
    }
  }

  return true;
}

function parseAmount_(value) {
  var parsed = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function cell_(row, index) {
  var value = row && row[index];
  return value == null ? "" : String(value).trim();
}

function normalizeSearch_(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function normalizePhone_(value) {
  return String(value || "").replace(/\D/g, "");
}

function isSheetDateLabel_(value) {
  return /^\d{1,2}\/\d{1,2}$/.test(value);
}

function json_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
