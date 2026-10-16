/**
 * Edge Inspector panel showing actionable quality checks, warnings, and auto-fix triggers.
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Sliders,
  Wrench,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { EdgeInspectorConfig, EdgeWarning } from '../../types';

interface EdgeInspectorPanelProps {
  warnings: EdgeWarning[];
  config: EdgeInspectorConfig;
  onConfigChange: (config: EdgeInspectorConfig) => void;
  onAutoFixWarning?: (warning: EdgeWarning) => void;
  onHighlightWarning?: (warning: EdgeWarning) => void;
}

export const EdgeInspectorPanel: React.FC<EdgeInspectorPanelProps> = ({
  warnings,
  config,
  onConfigChange,
  onAutoFixWarning,
  onHighlightWarning
}) => {
  const [showConfig, setShowConfig] = useState<boolean>(false);

  return (
    <div className="w-72 bg-white border-l border-neutral-200 flex flex-col h-full select-none text-xs">
      {/* Header */}
      <div className="p-3 border-b border-neutral-200 flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold text-neutral-800">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span>Edge Inspector</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
            warnings.length > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {warnings.length}
          </span>
        </div>

        <button
          onClick={() => setShowConfig(!showConfig)}
          title="Inspector Settings"
          className="p-1 hover:bg-neutral-100 rounded text-neutral-500 cursor-pointer"
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Config Drawer */}
      {showConfig && (
        <div className="p-3 bg-neutral-50 border-b border-neutral-200 flex flex-col gap-2.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-neutral-600">Print DPI:</span>
            <input
              type="number"
              min="72"
              max="1200"
              value={config.printDpi || 300}
              onChange={e => onConfigChange({ ...config, printDpi: Number(e.target.value) })}
              className="w-16 px-1 py-0.5 border border-neutral-300 rounded text-right bg-white"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="font-semibold text-neutral-600">Min Bridge (mm):</span>
            <input
              type="number"
              step="0.1"
              min="0.2"
              max="10"
              value={config.minPhysicalBridgeMm || 1.0}
              onChange={e => onConfigChange({ ...config, minPhysicalBridgeMm: Number(e.target.value) })}
              className="w-16 px-1 py-0.5 border border-neutral-300 rounded text-right bg-white"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="font-semibold text-neutral-600">Halo Tolerance:</span>
            <input
              type="number"
              min="5"
              max="80"
              value={config.colorHaloTolerance}
              onChange={e => onConfigChange({ ...config, colorHaloTolerance: Number(e.target.value) })}
              className="w-16 px-1 py-0.5 border border-neutral-300 rounded text-right bg-white"
            />
          </div>
        </div>
      )}

      {/* Warnings List */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
        {warnings.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-neutral-500 gap-2 my-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            <p className="font-semibold text-neutral-700">Clean Die-Cut Contour</p>
            <p className="text-[11px] text-neutral-400">
              No color halos, isolated islands, thin necks or clipped edges detected.
            </p>
          </div>
        ) : (
          warnings.map(warn => (
            <div
              key={warn.id}
              onClick={() => onHighlightWarning?.(warn)}
              className={`p-2.5 rounded-lg border flex flex-col gap-1.5 transition cursor-pointer ${
                warn.severity === 'error'
                  ? 'bg-red-50/50 border-red-200 hover:bg-red-50'
                  : 'bg-amber-50/50 border-amber-200 hover:bg-amber-50'
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className={`font-semibold capitalize text-[11px] ${
                  warn.severity === 'error' ? 'text-red-700' : 'text-amber-800'
                }`}>
                  {warn.type.replace('-', ' ')}
                </span>
                {warn.severity === 'error' ? (
                  <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded font-bold">Error</span>
                ) : (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded font-bold">Warning</span>
                )}
              </div>

              <p className="text-[11px] text-neutral-600 leading-relaxed">{warn.message}</p>

              {warn.autoFixable && onAutoFixWarning && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAutoFixWarning(warn);
                  }}
                  className="mt-1 flex items-center justify-center gap-1 py-1 px-2 rounded bg-white border border-neutral-300 font-semibold text-neutral-700 hover:bg-neutral-100 transition cursor-pointer text-[10px]"
                >
                  <Wrench className="w-3 h-3 text-pink-500" /> Auto-Fix
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
