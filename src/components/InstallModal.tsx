import React from 'react';
import { X, Monitor, Smartphone, Apple, CheckCircle2 } from 'lucide-react';

interface InstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallModal: React.FC<InstallModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-neutral-100 text-neutral-800 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-700 transition p-1.5 rounded-lg hover:bg-neutral-100"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-pink-500 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            ✂
          </div>
          <div>
            <h2 className="text-lg font-bold text-neutral-900 leading-tight">Install Sticker Studio</h2>
            <p className="text-xs text-neutral-500">Run as a standalone app with full offline capabilities</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Windows / Chromium */}
          <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200/70">
            <div className="flex items-center gap-2 font-semibold text-sm text-neutral-900 mb-1.5">
              <Monitor className="w-4 h-4 text-pink-600" />
              <span>Windows / Mac (Chrome or Edge)</span>
            </div>
            <ol className="text-xs text-neutral-600 list-decimal list-inside space-y-1 pl-1">
              <li>Look for the <strong>Install</strong> icon (computer with down arrow) on the right side of the address bar.</li>
              <li>Or click the <strong>three dots menu (⋮ / …)</strong> in the top-right corner.</li>
              <li>Select <strong>&quot;Install Sticker Studio&quot;</strong> and click <strong>Install</strong>.</li>
            </ol>
          </div>

          {/* Android */}
          <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200/70">
            <div className="flex items-center gap-2 font-semibold text-sm text-neutral-900 mb-1.5">
              <Smartphone className="w-4 h-4 text-green-600" />
              <span>Android (Chrome)</span>
            </div>
            <ol className="text-xs text-neutral-600 list-decimal list-inside space-y-1 pl-1">
              <li>Tap the <strong>three dots menu (⋮)</strong> in Chrome.</li>
              <li>Tap <strong>&quot;Add to Home screen&quot;</strong> or <strong>&quot;Install app&quot;</strong>.</li>
            </ol>
          </div>

          {/* iOS / iPadOS */}
          <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200/70">
            <div className="flex items-center gap-2 font-semibold text-sm text-neutral-900 mb-1.5">
              <Apple className="w-4 h-4 text-neutral-800" />
              <span>iPhone & iPad (Safari)</span>
            </div>
            <ol className="text-xs text-neutral-600 list-decimal list-inside space-y-1 pl-1">
              <li>Tap the <strong>Share</strong> button (square with an arrow pointing up).</li>
              <li>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong>.</li>
            </ol>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-neutral-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>100% Free · No App Store · Works Offline</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg shadow-sm transition cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
