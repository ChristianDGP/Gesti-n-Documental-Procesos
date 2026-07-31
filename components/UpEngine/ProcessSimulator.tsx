import React, { useState, useEffect, useRef } from 'react';
import { UpProcess, SimulationLog, SimulationMetrics } from '../../types/upEngine';
import {
  Play, Pause, RotateCcw, Zap, AlertTriangle, CheckCircle2,
  Clock, Shield, FileText, Download, Activity, Layers, Users
} from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  process: UpProcess;
}

export const ProcessSimulator: React.FC<Props> = ({ process }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentStageIdx, setCurrentStageIdx] = useState(0);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [logs, setLogs] = useState<SimulationLog[]>([]);
  const [metrics, setMetrics] = useState<SimulationMetrics>({
    totalExecutionTimeSeconds: 0,
    stagesCompleted: 0,
    deviationsDetected: 0,
    criticalViolations: 0,
    complianceRate: 100
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Stop simulation on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startSimulation = () => {
    if (process.stages.length === 0) {
      toast.error('El proceso no tiene etapas definidas para simular.');
      return;
    }
    setIsRunning(true);
    toast.info('Simulación iniciada en tiempo real');
  };

  const pauseSimulation = () => {
    setIsRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
    toast.info('Simulación pausada');
  };

  const resetSimulation = () => {
    setIsRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setCurrentStageIdx(0);
    setLogs([]);
    setMetrics({
      totalExecutionTimeSeconds: 0,
      stagesCompleted: 0,
      deviationsDetected: 0,
      criticalViolations: 0,
      complianceRate: 100
    });
    toast.info('Simulación reiniciada');
  };

  // Step ticker
  useEffect(() => {
    if (!isRunning) return;

    const intervalTime = Math.max(800 / speedMultiplier, 200);

    timerRef.current = setInterval(() => {
      setCurrentStageIdx((prevIdx) => {
        if (prevIdx >= process.stages.length) {
          setIsRunning(false);
          toast.success('¡Simulación de proceso completada con éxito!');
          return prevIdx;
        }

        const stage = process.stages[prevIdx];
        const isFailureRandom = Math.random() < 0.15; // 15% chance of warning
        const matchingRule = process.governanceRules[prevIdx % process.governanceRules.length];

        const newLog: SimulationLog = {
          id: `sim_log_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          timestamp: new Date().toLocaleTimeString('es-CL'),
          stageNumber: stage.number || prevIdx + 1,
          stageName: stage.name,
          role: stage.responsibleRole,
          status: isFailureRandom ? 'WARNING' : 'SUCCESS',
          durationSeconds: Math.round(stage.estimatedTimeMinutes * 60 * (0.8 + Math.random() * 0.4)),
          message: isFailureRandom
            ? `Alerta en PCC: ${stage.criticalControlPoints[0] || 'Desviación detectada de tiempo o norma'}`
            : `Etapa finalizada correctamente según norma. Subpasos validados: ${stage.substeps.length}`,
          ruleViolated: isFailureRandom && matchingRule ? `${matchingRule.code}: ${matchingRule.title}` : undefined
        };

        setLogs((prev) => [newLog, ...prev]);

        setMetrics((prev) => {
          const newCompleted = prev.stagesCompleted + 1;
          const newDeviations = prev.deviationsDetected + (isFailureRandom ? 1 : 0);
          const newCritical = prev.criticalViolations + (isFailureRandom && stage.failureImpact === 'CRITICAL' ? 1 : 0);
          const totalExec = prev.totalExecutionTimeSeconds + newLog.durationSeconds;
          const compRate = Math.max(0, Math.round(((newCompleted - newDeviations) / newCompleted) * 100));

          return {
            totalExecutionTimeSeconds: totalExec,
            stagesCompleted: newCompleted,
            deviationsDetected: newDeviations,
            criticalViolations: newCritical,
            complianceRate: compRate
          };
        });

        if (isFailureRandom) {
          toast.warning(`Alerta de Desviación en Etapa ${stage.number}: ${stage.name}`);
        }

        return prevIdx + 1;
      });
    }, intervalTime);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, speedMultiplier, process]);

  // Inject test failure button
  const injectTestFailure = () => {
    if (process.stages.length === 0) return;
    const currentStage = process.stages[Math.min(currentStageIdx, process.stages.length - 1)];
    const rule = process.governanceRules[0] || { code: 'NORM-FAIL-01', title: 'Falla Provocada en Control Crítico' };

    const failureLog: SimulationLog = {
      id: `sim_fail_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('es-CL'),
      stageNumber: currentStage.number || 1,
      stageName: currentStage.name,
      role: currentStage.responsibleRole,
      status: 'FAILURE',
      durationSeconds: 120,
      message: `[INYECCIÓN DE PRUEBA] Violación bloqueante detectada en punto de control crítico PCC: ${currentStage.criticalControlPoints[0] || 'Falla simulación'}`,
      ruleViolated: `${rule.code}: ${rule.title}`
    };

    setLogs((prev) => [failureLog, ...prev]);
    setMetrics((prev) => ({
      ...prev,
      deviationsDetected: prev.deviationsDetected + 1,
      criticalViolations: prev.criticalViolations + 1,
      complianceRate: Math.max(0, prev.complianceRate - 20)
    }));

    toast.error(`¡Falla Crítica Inyectada en ${currentStage.name}! Regla ${rule.code} violada.`);
  };

  // Export report
  const exportReport = () => {
    const reportData = {
      processName: process.name,
      processVersion: process.version,
      simulationDate: new Date().toLocaleString('es-CL'),
      metrics,
      logs
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `UpEngine_Auditoria_${process.id}_${Date.now()}.json`;
    a.click();
    toast.success('Informe de auditoría exportado correctamente.');
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Simulation Controls Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {!isRunning ? (
            <button
              onClick={startSimulation}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
            >
              <Play size={16} />
              <span>{currentStageIdx > 0 ? 'Reanudar' : 'Iniciar Simulación'}</span>
            </button>
          ) : (
            <button
              onClick={pauseSimulation}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
            >
              <Pause size={16} />
              <span>Pausar</span>
            </button>
          )}

          <button
            onClick={resetSimulation}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200"
          >
            <RotateCcw size={16} />
            <span>Reiniciar</span>
          </button>

          <button
            onClick={injectTestFailure}
            className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all"
          >
            <Zap size={16} className="text-rose-600 fill-rose-600" />
            <span>Inyectar Falla de Prueba</span>
          </button>
        </div>

        {/* Speed & Export */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            {[1, 2, 5].map((s) => (
              <button
                key={s}
                onClick={() => setSpeedMultiplier(s)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  speedMultiplier === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <button
            onClick={exportReport}
            disabled={logs.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
          >
            <Download size={16} />
            <span>Exportar Auditoría</span>
          </button>
        </div>
      </div>

      {/* Real-time Metrics Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
            Etapas Completadas
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">
              {metrics.stagesCompleted} / {process.stages.length}
            </span>
            <Layers size={18} className="text-indigo-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
            Tiempo Ejecución
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-slate-900">
              {Math.floor(metrics.totalExecutionTimeSeconds / 60)}m {metrics.totalExecutionTimeSeconds % 60}s
            </span>
            <Clock size={18} className="text-slate-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
            Desviaciones Detectadas
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-600">
              {metrics.deviationsDetected}
            </span>
            <AlertTriangle size={18} className="text-amber-500" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
            Fallas Bloqueantes
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-rose-600">
              {metrics.criticalViolations}
            </span>
            <Shield size={18} className="text-rose-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm col-span-2 lg:col-span-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
            Tasa de Cumplimiento
          </span>
          <div className="flex items-baseline justify-between">
            <span className={`text-2xl font-black ${metrics.complianceRate >= 80 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {metrics.complianceRate}%
            </span>
            <Activity size={18} className={metrics.complianceRate >= 80 ? 'text-emerald-600' : 'text-rose-600'} />
          </div>
        </div>
      </div>

      {/* Active Stage Stepper */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Activity size={18} className="text-indigo-600" />
          Estado de Ejecución del Flujo de Etapas
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {process.stages.map((stage, idx) => {
            const isDone = idx < currentStageIdx;
            const isCurrent = idx === currentStageIdx && isRunning;
            return (
              <div
                key={stage.id || idx}
                className={`p-4 rounded-xl border transition-all ${
                  isCurrent
                    ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-500/20 shadow-sm'
                    : isDone
                    ? 'bg-emerald-50/60 border-emerald-200 text-slate-700'
                    : 'bg-slate-50 border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Etapa {stage.number || idx + 1}
                  </span>
                  {isDone ? (
                    <CheckCircle2 size={16} className="text-emerald-600" />
                  ) : isCurrent ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-ping" />
                  ) : null}
                </div>
                <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{stage.name}</h4>
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{stage.responsibleRole}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Real-time Event Log */}
      <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-white">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Activity size={18} className="text-indigo-400" />
            Registro de Auditoría de Eventos en Tiempo Real
          </h3>
          <span className="text-xs font-mono text-slate-400">{logs.length} Eventos</span>
        </div>

        {logs.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs font-mono">
            Presione "Iniciar Simulación" para comenzar la captura de eventos normativos...
          </div>
        ) : (
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-2 font-mono text-xs">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  log.status === 'FAILURE'
                    ? 'bg-rose-950/60 border-rose-800/80 text-rose-200'
                    : log.status === 'WARNING'
                    ? 'bg-amber-950/60 border-amber-800/80 text-amber-200'
                    : 'bg-slate-900/80 border-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-[10px] text-slate-500 shrink-0 mt-0.5">{log.timestamp}</span>
                  <div>
                    <span className="font-bold text-white block">
                      [Etapa {log.stageNumber}] {log.stageName} — <span className="text-indigo-400">{log.role}</span>
                    </span>
                    <p className="text-[11px] opacity-90 mt-0.5">{log.message}</p>
                    {log.ruleViolated && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded text-[10px] font-bold">
                        Regla Afectada: {log.ruleViolated}
                      </span>
                    )}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <span className="text-[10px] text-slate-400 block font-mono">
                    {log.durationSeconds}s ejec.
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
