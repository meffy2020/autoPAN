import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <h1 className="text-3xl font-bold text-blue-600 mb-2">나놀다판</h1>
        <p className="text-gray-500 mb-8">노원청소년센터 무인 접수 및 대기열 시스템</p>
        
        <div className="space-y-4">
          <Link 
            href="/kiosk" 
            className="block w-full py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold text-lg transition-colors"
          >
            기기 이용 신청하기 (키오스크)
          </Link>
          
          <Link 
            href="/admin" 
            className="block w-full py-4 bg-gray-800 hover:bg-gray-900 text-white rounded-xl font-bold text-lg transition-colors mt-4"
          >
            관리자 페이지 접속
          </Link>
        </div>
      </div>
    </div>
  );
}
