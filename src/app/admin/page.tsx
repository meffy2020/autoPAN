"use client";

import { useState, useEffect, useCallback } from 'react';

const QUEUE_MOCK = [
  { id: 1, name: '김민수', phone: '1234', device: 'pc', status: '대기중', createdAt: new Date().toISOString() },
  { id: 2, name: '이수진', phone: '5678', device: 'switch', status: '대기중', createdAt: new Date().toISOString() },
];

export default function AdminPage() {
  const [queue, setQueue] = useState(QUEUE_MOCK);
  const [activeSessions, setActiveSessions] = useState([
    { id: 101, name: '박철수', device: 'pc', seat: 1, endTime: Date.now() + 5000 }, // 5 seconds for testing TTS
  ]);

  const approveSession = (item: any) => {
    // 결제 완료 후 시간 할당 로직
    const newSession = {
      id: Date.now(),
      name: item.name,
      device: item.device,
      seat: 1, // 자리 배정 로직 필요
      endTime: Date.now() + 3600000 // 1시간 (60분)
    };
    
    setActiveSessions([...activeSessions, newSession]);
    setQueue(queue.filter(q => q.id !== item.id));
  };

  const playTTS = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      
      setActiveSessions(prevSessions => {
        let hasExpired = false;
        
        const updated = prevSessions.map(session => {
          if (session.endTime <= now) {
            hasExpired = true;
            // 한 번만 울리게 처리하는 플래그 로직 필요 (여기선 간소화)
            playTTS(`${session.name} 학생, ${session.device === 'pc' ? '컴퓨터' : '게임기'} 시간이 종료되었습니다. 카운터로 와주세요.`);
            return { ...session, expired: true }; // 만료 처리
          }
          return session;
        });

        if (hasExpired) {
           return updated.filter(s => !s.expired); // 종료된 세션 목록에서 제거
        }
        
        return prevSessions; // 강제 리렌더링 방지 (실제 환경에선 별도 상태관리)
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [playTTS]);

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex flex-col gap-8 md:flex-row">
      
      {/* 대기열 및 승인 (좌측) */}
      <div className="flex-1 bg-white p-6 rounded-2xl shadow-xl">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-4">결제 대기 및 예약 내역</h2>
        
        {queue.length === 0 ? (
          <p className="text-gray-500 text-center py-8">현재 대기 인원이 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {queue.map(item => (
              <div key={item.id} className="p-4 border rounded-xl flex justify-between items-center bg-gray-50">
                <div>
                  <h3 className="font-bold text-lg">{item.name} <span className="text-sm font-normal text-gray-500">({item.phone})</span></h3>
                  <p className="text-blue-600 font-bold">{item.device === 'pc' ? '컴퓨터' : item.device === 'switch' ? '닌텐도 스위치' : '플스'} 희망</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => approveSession(item)} className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-bold">승인 (1시간)</button>
                  <button onClick={() => setQueue(queue.filter(q => q.id !== item.id))} className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg font-bold">취소</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 이용 현황 (우측) */}
      <div className="flex-1 bg-white p-6 rounded-2xl shadow-xl">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-4">실시간 이용 현황</h2>
        
        <div className="grid grid-cols-2 gap-4">
          {activeSessions.map(session => {
             const remainingSeconds = Math.max(0, Math.floor((session.endTime - Date.now()) / 1000));
             const minutes = Math.floor(remainingSeconds / 60);
             const seconds = remainingSeconds % 60;
             const isUrgent = remainingSeconds < 300; // 5분 미만
             
             return (
              <div key={session.id} className={`p-4 border rounded-xl flex flex-col items-center justify-center text-center ${isUrgent ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                <span className="font-bold text-lg mb-1">{session.name}</span>
                <span className="text-sm text-gray-600 mb-3">{session.device.toUpperCase()} - {session.seat}번 자리</span>
                <span className={`text-3xl font-mono font-bold ${isUrgent ? 'text-red-500 animate-pulse' : 'text-blue-600'}`}>
                  {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </span>
                <button onClick={() => setActiveSessions(activeSessions.filter(s => s.id !== session.id))} className="mt-4 text-sm text-gray-400 hover:text-red-500 underline">강제 종료</button>
              </div>
            );
          })}
          
          {activeSessions.length === 0 && (
            <div className="col-span-2 text-center text-gray-500 py-8">현재 이용중인 기기가 없습니다.</div>
          )}
        </div>
      </div>
      
    </div>
  );
}
