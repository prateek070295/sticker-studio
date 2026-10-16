/**
 * Left-hand vertical tool selector for the Advanced Extraction Editor.
 */

import React from 'react';
import {
  MousePointer,
  Paintbrush,
  Eraser,
  Split,
  EyeOff,
  PlusSquare,
  MinusSquare,
  Sparkles,
  Hand
} from 'lucide-react';
import { ToolMode } from '../../types';

interface EditorToolbarProps {
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  toolMode,
  onToolModeChange
}) => {
  const tools = [
    { mode: 'select' as ToolMode, icon: MousePointer, label: 'Select (V)', shortcut: 'V' },
    { mode: 'pan' as ToolMode, icon: Hand, label: 'Pan (H / Middle Click)', shortcut: 'H' },
    { divider: true },
    { mode: 'restore-brush' as ToolMode, icon: Paintbrush, label: 'Restore Brush (B)', shortcut: 'B' },
    { mode: 'erase-brush' as ToolMode, icon: Eraser, label: 'Erase Brush (E)', shortcut: 'E' },
    { mode: 'smart-erase' as ToolMode, icon: EyeOff, label: 'Smart Hole Erase (O)', shortcut: 'O' },
    { divider: true },
    { mode: 'split' as ToolMode, icon: Split, label: 'Touching Split (S)', shortcut: 'S' },
    { divider: true },
    { mode: 'add-backing' as ToolMode, icon: PlusSquare, label: 'Add Backing Patch (A)', shortcut: 'A' },
    { mode: 'remove-backing' as ToolMode, icon: MinusSquare, label: 'Remove Backing Patch (R)', shortcut: 'R' },
    { mode: 'smooth-backing' as ToolMode, icon: Sparkles, label: 'Smooth Backing Contour (M)', shortcut: 'M' }
  ];

  return (
    <aside className="w-14 bg-white border-r border-neutral-200 flex flex-col items-center py-3 gap-1 select-none z-20">
      {tools.map((t, idx) => {
        if ('divider' in t) {
          return <div key={`div_${idx}`} className="w-8 h-px bg-neutral-200 my-1.5" />;
        }
        const Icon = t.icon;
        const isActive = toolMode === t.mode;
        return (
          <button
            key={t.mode}
            onClick={() => onToolModeChange(t.mode)}
            title={t.label}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition cursor-pointer relative group ${
              isActive
                ? 'bg-pink-100 text-pink-600 font-bold shadow-xs'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            }`}
          >
            <Icon className="w-5 h-5" />
            {/* Tooltip badge */}
            <span className="absolute left-12 ml-2 px-2 py-1 bg-neutral-800 text-white text-xs rounded opacity-0 pointer-events-none group-hover:opacity-100 whitespace-nowrap z-50 shadow-md">
              {t.label}
            </span>
          </button>
        );
      })}
    </aside>
  );
};
