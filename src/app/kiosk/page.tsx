"use client";

import { useState } from 'react';

const DEVICES = [
  { id: 'pc', name: '컴퓨터', count: 6 },
  { id: 'switch', name: '닌텐도 스위치', count: 4 },
  { id: 'ps', name: '플레이스테이션', count: 2 },
];

export default function KioskPage() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({ name: '', phone: '', device: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Send to Firebase/DB
    setStep(3); // Success screen
  };

  return (
    <div className="min-h-screen bg-blue-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full">
        <h1 className="text-3xl font-bold text-center text-blue-600 mb-8">기기 이용 접수증</h1>
        
        {step === 1 && (
          <form onSubmit={() => setStep(2)} className="space-y-6">
            <div>
              <label className="block text-gray-700 font-bold mb-2">이름</label>
              <input 
                required 
                type="text" 
                className="w-full p-4 border rounded-xl text-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="홍길동"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-gray-700 font-bold mb-2">연락처 (뒷자리 4개)</label>
              <input 
                required 
                type="text" 
                maxLength={4}
                className="w-full p-4 border rounded-xl text-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="1234"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
              />
            </div>
            <button type="submit" className="w-full py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold text-xl transition-colors mt-8">
              다음으로
            </button>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-center mb-4">어떤 기기를 이용할까요?</h2>
            <div className="grid gap-4">
              {DEVICES.map(dev => (
                <button
                  key={dev.id}
                  onClick={() => {
                    setFormData({...formData, device: dev.id});
                    setStep(3);
                  }}
                  className="p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left flex justify-between items-center"
                >
                  <span className="text-xl font-bold">{dev.name}</span>
                  <span className="bg-gray-100 px-3 py-1 rounded-full text-sm font-bold text-gray-600">총 {dev.count}대</span>
                </button>
              ))}
            </div>
            <button onClick={() => setStep(1)} className="w-full py-4 text-gray-500 font-bold mt-4">
              이전으로 돌아가기
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="text-center py-8">
            <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">✓</div>
            <h2 className="text-2xl font-bold mb-2">접수가 완료되었습니다!</h2>
            <p className="text-gray-600 mb-8">카운터에서 결제 후 자리를 배정받아주세요.</p>
            <button onClick={() => { setStep(1); setFormData({name:'', phone:'', device:''}) }} className="w-full py-4 bg-blue-500 text-white rounded-xl font-bold text-xl">
              처음으로 돌아가기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
