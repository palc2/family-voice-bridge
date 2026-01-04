'use client';

import { useState } from 'react';
import SessionRecorder from '@/components/SessionRecorder';
import Link from 'next/link';

// TODO: These should come from user context/auth in production
const DEFAULT_HOUSEHOLD_ID = '00000000-0000-0000-0000-000000000000';
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

export default function Home() {
  const [householdId] = useState(DEFAULT_HOUSEHOLD_ID);
  const [userId] = useState(DEFAULT_USER_ID);

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col">
      <div className="container mx-auto px-4 py-1 sm:py-2 max-w-md flex-1 flex flex-col">
        {/* Header */}
        <div className="text-center mb-1 sm:mb-2 flex-shrink-0">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-2 sm:mb-3">
            <span className="block">家庭语音桥</span>
            <span className="block text-2xl sm:text-3xl md:text-4xl text-gray-700 mt-0.5 sm:mt-1">Family Voice Bridge</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-600 font-medium">
            <span className="block italic">&ldquo;一键说话, 在练中学&rdquo;</span>
            <span className="block text-sm sm:text-base md:text-lg text-gray-500 mt-1 font-normal italic">&ldquo;Speak with one tap, learn from practice&rdquo;</span>
          </p>
        </div>

        {/* Main Session Recorder - Takes remaining space */}
        <div className="flex-1 flex items-center justify-center min-h-0">
          <SessionRecorder
            householdId={householdId}
            initiatedByUserId={userId}
            onSessionComplete={() => {
              console.log('Session completed');
            }}
          />
        </div>

        {/* Learning Section */}
        <div className="mt-0.5 sm:mt-1 flex-shrink-0">
          <div className="text-center mb-1 sm:mb-1.5">
            <p className="text-lg sm:text-xl md:text-2xl text-gray-700 font-medium">
              <span className="block">学习回顾</span>
              <span className="block text-sm sm:text-base md:text-lg text-gray-500 mt-0.5 font-normal">Learning Review</span>
            </p>
          </div>
          <div className="text-center space-y-1 sm:space-y-0 sm:space-x-2 flex flex-col sm:flex-row justify-center items-center pb-0.5 sm:pb-1">
            <Link
              href="/vocabulary"
              className="w-full sm:w-auto inline-block px-4 sm:px-6 py-2 sm:py-3 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-lg transition-colors text-base sm:text-lg shadow-md"
            >
              <span className="block sm:inline">每日词汇</span>
              <span className="block sm:inline text-sm sm:text-base sm:ml-2">Daily Vocabulary</span>
              <span className="sm:inline"> →</span>
            </Link>
            <Link
              href="/review"
              className="w-full sm:w-auto inline-block px-4 sm:px-6 py-2 sm:py-3 bg-fuchsia-500 hover:bg-fuchsia-600 text-white font-semibold rounded-lg transition-colors text-base sm:text-lg shadow-md"
            >
              <span className="block sm:inline">每日小结</span>
              <span className="block sm:inline text-sm sm:text-base sm:ml-2">Daily Learning</span>
              <span className="sm:inline"> →</span>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

