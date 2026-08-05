import React from 'react';
import { Mic } from 'lucide-react';

export interface DeckarcAIFloatingButtonProps {
  onOpen: () => void;
}

export const DeckarcAIFloatingButton: React.FC<DeckarcAIFloatingButtonProps> = ({ onOpen }) => {
  return (
    <div className="fixed bottom-6 right-6 z-40">
      {/* Subtle pulsing background ring */}
      <span className="absolute -inset-1 rounded-full bg-cyan-400 opacity-75 blur-sm animate-pulse" />
      
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open DECKARC AI Console"
        title="Open DECKARC AI Console"
        className="relative flex items-center justify-center w-14 h-14 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-lg shadow-cyan-500/30 hover:shadow-cyan-400/50 hover:scale-105 active:scale-95 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-900 group"
      >
        <Mic className="w-6 h-6 text-slate-950 group-hover:scale-110 transition-transform duration-200" />
      </button>
    </div>
  );
};

export default DeckarcAIFloatingButton;