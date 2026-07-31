import React, { useState } from 'react';
import { UpProcess, SeverityLevel } from '../../types/upEngine';
import {
  FileText, Shield, AlertTriangle, Layers, Users, Cpu,
  CheckCircle2, Clock, Activity, Sparkles, Check, FileCheck,
  Target, Award, ArrowRight, Table, ListChecks, HelpCircle
} from 'lucide-react';

interface Props {
  process: UpProcess;
  onEditProcess?: () => void;
}

type TabType = 'FCE' | 'TO_BE' | 'ROLES' | 'RULES';

export const FrameworkDocViewer: React.FC<Props> = ({ process }) => {
  const [activeTab, setActiveTab] = useState<TabType>('FCE');

  // Normalize data between Word extraction and standard UpProcess format
  const metaCode = process.meta?.code || process.id || 'N/A';
  const metaName = process.meta?.name || process.name || 'Proceso sin nombre';
  const metaVersion = process.meta?.version || process.version || '1.0';
  const metaOwner = process.meta?.owner || process.docAuthor || 'No especificado';
  const metaType = process.meta?.type || process.docType || 'Operativo';

  const purpose = process.purpose || process.asIsContext || process.description || 'Sin objetivo registrado.';
  const scope = process.scope || process.toBeOptimizations || 'Sin alcance registrado.';

  // Normalized KPIs
  const kpis = (process.kpis && process.kpis.length > 0)
    ? process.kpis
    : (process.fceFactors || []).map((fce, idx) => ({
        name: `KPI-${idx + 1}`,
        metric: 'Cumplimiento normativo y trazabilidad',
        target: fce,
        frequency: 'Mensual'
      }));

  // Normalized SIPOC
  const sipocSuppliers = process.sipoc?.suppliers?.length ? process.sipoc.suppliers : (process.sipocRows?.map(s => s.supplier) || ['Unidad Solicitante']);
  const sipocInputs = process.sipoc?.inputs?.length ? process.sipoc.inputs : (process.sipocRows?.map(s => s.input) || ['Requerimiento / Expediente']);
  const sipocName = process.sipoc?.processName || process.name;
  const sipocOutputs = process.sipoc?.outputs?.length ? process.sipoc.outputs : (process.sipocRows?.map(s => s.output) || ['Aprobación / Resolución Final']);
  const sipocCustomers = process.sipoc?.customers?.length ? process.sipoc.customers : (process.sipocRows?.map(s => s.customer) || ['Usuario / Destinatario']);

  // Normalized Roles
  const rolesList = (process.wordRoles && process.wordRoles.length > 0)
    ? process.wordRoles
    : (process.roles || []).map((r, idx) => ({
        id: r.id || `role_${idx + 1}`,
        title: r.name,
        responsibility: Array.isArray(r.responsibilities) ? r.responsibilities.join('. ') : (r.responsibilities || 'Responsable de ejecución')
      }));

  // Normalized Steps for TO BE Matrix
  const stepsList = (process.steps && process.steps.length > 0)
    ? process.steps
    : (process.stages || []).map((s, idx) => ({
        id: s.id || `step_${idx + 1}`,
        name: s.name,
        roleId: s.responsibleRole,
        description: s.description,
        inputs: s.substeps || [],
        outputs: ['Registro en SGD / Expediente Conforme'],
        duration: `${s.estimatedTimeMinutes || 30} min`,
        rules: s.criticalControlPoints || []
      }));

  // Normalized Business Rules
  const rulesList = (process.businessRules && process.businessRules.length > 0)
    ? process.businessRules
    : (process.governanceRules || []).map((r, idx) => ({
        id: r.code || r.id || `rule_${idx + 1}`,
        description: `${r.title}: ${r.description}`,
        type: r.enforcementType === 'BLOCKING' ? 'Bloqueante' : (r.severity === 'HIGH' ? 'Advertencia' : 'Informativo')
      }));

  // Helper for Role title lookup
  const getRoleTitle = (roleId: string) => {
    const found = rolesList.find(r => r.id === roleId || r.title === roleId);
    return found ? found.title : roleId;
  };

  const getRuleBadge = (type: string) => {
    const t = (type || '').toLowerCase();
    if (t.includes('bloque') || t.includes('critical') || t.includes('blocking')) {
      return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">Bloqueante</span>;
    }
    if (t.includes('adver') || t.includes('warn') || t.includes('high')) {
      return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">Advertencia</span>;
    }
    return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-sky-100 text-sky-800 border border-sky-200">Informativo</span>;
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Tab Navigation Header */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('FCE')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shrink-0 ${
            activeTab === 'FCE'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <FileCheck size={16} />
          <span>Ficha FCE (Caracterización)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('TO_BE')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shrink-0 ${
            activeTab === 'TO_BE'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Table size={16} />
          <span>Matriz Actividades TO BE ({stepsList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ROLES')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shrink-0 ${
            activeTab === 'ROLES'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Users size={16} />
          <span>Roles y Responsabilidades ({rolesList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('RULES')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shrink-0 ${
            activeTab === 'RULES'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Shield size={16} />
          <span>Reglas de Negocio ({rulesList.length})</span>
        </button>
      </div>

      {/* TAB 1: FICHA DE CARACTERIZACIÓN (FCE) */}
      {activeTab === 'FCE' && (
        <div className="space-y-6">
          {/* Header Summary Cards */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-widest mb-1">
                  <Sparkles size={14} /> Ficha de Caracterización de Proceso (FCE)
                </div>
                <h2 className="text-xl font-bold text-slate-900">{metaName}</h2>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg font-mono">
                  Código: {metaCode}
                </span>
                <span className="px-3 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold rounded-lg font-mono">
                  v{metaVersion}
                </span>
                <span className="px-3 py-1 bg-purple-50 border border-purple-100 text-purple-800 text-xs font-bold rounded-lg">
                  {metaType}
                </span>
              </div>
            </div>

            {/* Purpose, Scope, Owner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-1.5">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Dueño / Responsable del Proceso
                </span>
                <p className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <Users size={14} className="text-indigo-600 shrink-0" />
                  {metaOwner}
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-1.5 md:col-span-2">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Objetivo del Proceso
                </span>
                <p className="text-xs text-slate-800 font-medium leading-relaxed">
                  {purpose}
                </p>
              </div>
            </div>

            <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 space-y-1.5">
              <span className="text-[10px] font-extrabold text-indigo-700 uppercase tracking-wider block flex items-center gap-1.5">
                <Target size={13} /> Alcance del Proceso
              </span>
              <p className="text-xs text-indigo-950 font-medium leading-relaxed">
                {scope}
              </p>
            </div>
          </div>

          {/* KPI Indicators Table */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <Activity size={18} className="text-indigo-600" />
              Indicadores Clave de Desempeño (KPIs)
            </h3>

            {kpis.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No se registraron KPIs en este documento.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <th className="p-3 rounded-tl-lg">Nombre del Indicador</th>
                      <th className="p-3">Métrica</th>
                      <th className="p-3">Meta Esperada</th>
                      <th className="p-3 rounded-tr-lg">Frecuencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {kpis.map((kpi, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-all">
                        <td className="p-3 font-bold text-slate-900">{kpi.name}</td>
                        <td className="p-3 text-slate-600">{kpi.metric || 'Porcentaje de cumplimiento'}</td>
                        <td className="p-3 font-bold text-indigo-700">{kpi.target}</td>
                        <td className="p-3 text-slate-500 font-mono text-[11px]">{kpi.frequency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SIPOC Matrix */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <Layers size={18} className="text-purple-600" />
              Matriz SIPOC (Suppliers - Inputs - Process - Outputs - Customers)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {/* S: Suppliers */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-black text-purple-700 uppercase tracking-widest block mb-2 border-b border-purple-200/80 pb-1">
                    S - Proveedores
                  </span>
                  <ul className="space-y-1.5">
                    {sipocSuppliers.map((s, i) => (
                      <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0 mt-1.5" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* I: Inputs */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-black text-blue-700 uppercase tracking-widest block mb-2 border-b border-blue-200/80 pb-1">
                    I - Entradas
                  </span>
                  <ul className="space-y-1.5">
                    {sipocInputs.map((inp, i) => (
                      <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                        <span>{inp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* P: Process Name */}
              <div className="bg-indigo-600 text-white p-4 rounded-xl shadow-md flex flex-col justify-between">
                <div>
                  <span className="text-xs font-black text-white/90 uppercase tracking-widest block mb-2 border-b border-white/20 pb-1">
                    P - Proceso Central
                  </span>
                  <p className="text-xs font-bold leading-relaxed">{sipocName}</p>
                </div>
              </div>

              {/* O: Outputs */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-black text-emerald-700 uppercase tracking-widest block mb-2 border-b border-emerald-200/80 pb-1">
                    O - Salidas
                  </span>
                  <ul className="space-y-1.5">
                    {sipocOutputs.map((out, i) => (
                      <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
                        <span>{out}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* C: Customers */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-black text-amber-700 uppercase tracking-widest block mb-2 border-b border-amber-200/80 pb-1">
                    C - Clientes / Dest.
                  </span>
                  <ul className="space-y-1.5">
                    {sipocCustomers.map((cust, i) => (
                      <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                        <span>{cust}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MATRIZ DE ACTIVIDADES TO BE */}
      {activeTab === 'TO_BE' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Table size={20} className="text-indigo-600" />
                Matriz de Actividades y Flujo TO BE
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Secuencia tabulada de pasos, roles, insumos, productos, duraciones y reglas aplicables.
              </p>
            </div>
            <span className="text-xs font-bold px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg">
              {stepsList.length} Actividades
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-900 text-white font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-3 w-16 text-center rounded-tl-lg"># Paso</th>
                  <th className="p-3 w-48">Nombre de Actividad</th>
                  <th className="p-3 w-44">Rol Responsable</th>
                  <th className="p-3 min-w-[200px]">Descripción</th>
                  <th className="p-3 w-36">Entradas</th>
                  <th className="p-3 w-36">Salidas</th>
                  <th className="p-3 w-28 text-center">Duración</th>
                  <th className="p-3 min-w-[160px] rounded-tr-lg">Reglas Aplicables</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800 font-medium">
                {stepsList.map((step, idx) => (
                  <tr key={step.id || idx} className="hover:bg-slate-50/90 transition-all">
                    {/* # Paso */}
                    <td className="p-3 text-center">
                      <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-800 font-black text-xs inline-flex items-center justify-center">
                        {idx + 1}
                      </span>
                    </td>

                    {/* Nombre Actividad */}
                    <td className="p-3 font-bold text-slate-900">
                      {step.name}
                    </td>

                    {/* Rol Responsable */}
                    <td className="p-3">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-800 text-[11px] font-bold rounded-lg border border-slate-200 inline-flex items-center gap-1">
                        <Users size={12} className="text-indigo-500" />
                        {getRoleTitle(step.roleId)}
                      </span>
                    </td>

                    {/* Descripción */}
                    <td className="p-3 text-slate-600 leading-relaxed text-[11px]">
                      {step.description}
                    </td>

                    {/* Entradas */}
                    <td className="p-3">
                      {step.inputs && step.inputs.length > 0 ? (
                        <ul className="space-y-1">
                          {step.inputs.map((inp, i) => (
                            <li key={i} className="text-[10px] bg-blue-50 text-blue-900 px-2 py-0.5 rounded border border-blue-100">
                              {inp}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">-</span>
                      )}
                    </td>

                    {/* Salidas */}
                    <td className="p-3">
                      {step.outputs && step.outputs.length > 0 ? (
                        <ul className="space-y-1">
                          {step.outputs.map((out, i) => (
                            <li key={i} className="text-[10px] bg-emerald-50 text-emerald-900 px-2 py-0.5 rounded border border-emerald-100">
                              {out}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">-</span>
                      )}
                    </td>

                    {/* Duración */}
                    <td className="p-3 text-center">
                      <span className="px-2 py-1 bg-slate-100 text-slate-700 text-[10px] font-mono font-bold rounded border border-slate-200 inline-flex items-center gap-1">
                        <Clock size={11} className="text-slate-400" />
                        {step.duration}
                      </span>
                    </td>

                    {/* Reglas Aplicables */}
                    <td className="p-3">
                      {step.rules && step.rules.length > 0 ? (
                        <div className="space-y-1">
                          {step.rules.map((rule, i) => (
                            <div key={i} className="text-[10px] bg-amber-50 text-amber-900 px-2 py-0.5 rounded border border-amber-200 font-semibold flex items-center gap-1">
                              <Shield size={10} className="text-amber-600 shrink-0" />
                              <span>{rule}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Ninguna</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ROLES Y RESPONSABILIDADES */}
      {activeTab === 'ROLES' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users size={18} className="text-indigo-600" />
              Matriz de Roles y Responsabilidades
            </h3>
            <span className="text-xs font-bold text-slate-500 font-mono">
              {rolesList.length} Roles Definidos
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <th className="p-3 w-32 rounded-tl-lg">ID / Código</th>
                  <th className="p-3 w-56">Título del Rol</th>
                  <th className="p-3 rounded-tr-lg">Responsabilidades y Funciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {rolesList.map((role, idx) => (
                  <tr key={role.id || idx} className="hover:bg-slate-50/80 transition-all">
                    <td className="p-3 font-mono font-bold text-indigo-600 text-[11px]">
                      {role.id || `ROLE_${idx + 1}`}
                    </td>
                    <td className="p-3 font-bold text-slate-900">
                      {role.title}
                    </td>
                    <td className="p-3 text-slate-600 leading-relaxed">
                      {role.responsibility}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: REGLAS DE NEGOCIO */}
      {activeTab === 'RULES' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Shield size={18} className="text-rose-600" />
              Reglas de Negocio y Control Gobernado
            </h3>
            <span className="text-xs font-bold text-slate-500 font-mono">
              {rulesList.length} Reglas Registradas
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <th className="p-3 w-32 rounded-tl-lg">ID / Código</th>
                  <th className="p-3">Descripción de la Regla de Negocio</th>
                  <th className="p-3 w-36 text-center rounded-tr-lg">Tipo / Nivel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {rulesList.map((rule, idx) => (
                  <tr key={rule.id || idx} className="hover:bg-slate-50/80 transition-all">
                    <td className="p-3 font-mono font-bold text-slate-900 text-[11px]">
                      <span className="px-2 py-0.5 bg-slate-800 text-white rounded text-[10px]">
                        {rule.id || `RULE_${idx + 1}`}
                      </span>
                    </td>
                    <td className="p-3 text-slate-700 leading-relaxed font-medium">
                      {rule.description}
                    </td>
                    <td className="p-3 text-center">
                      {getRuleBadge(rule.type)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

