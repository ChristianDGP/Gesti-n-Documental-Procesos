
import React from 'react';
import { User, UserRole } from '../types';
import { BookOpen, CheckCircle2, XCircle, Info, FileText, ArrowRight, Users, Settings } from 'lucide-react';

interface Props {
  user: User;
}

const NomenclatureGuide: React.FC<Props> = ({ user }) => {
  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Guía de Nomenclatura</h1>
          <p className="text-slate-500">Reglas de validación para nombres de archivos y versiones.</p>
        </div>
        <div className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium border border-indigo-100 flex items-center gap-2">
          <Info size={18} />
          <span>Lógica de Negocio v2.1</span>
        </div>
      </div>

      {/* Estructura Base */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="text-indigo-600" />
            Estructura del Nombre de Archivo
          </h2>
        </div>
        <div className="p-6 space-y-6">
          <div className="bg-slate-900 rounded-xl p-6 text-white font-mono text-lg text-center shadow-inner">
             PROYECTO - Microproceso - TIPO - Versión
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Proyecto</span>
              <span className="font-bold text-slate-700">HPC, HSR o REU</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Microproceso</span>
              <span className="font-bold text-slate-700">Nombre del proceso</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Tipo</span>
              <span className="font-bold text-slate-700">AS IS, FCE, PM o TO BE</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Versión</span>
              <span className="font-bold text-slate-700">v0.1, v1.0, etc.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Lógica de Versiones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Revisión Interna */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-indigo-50/50">
            <h2 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
              <BookOpen size={20} />
              Revisión Interna (v0.n)
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-600">Utilizado para el flujo entre Analista y Coordinador antes de enviar al referente.</p>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 border border-green-100">
                <CheckCircle2 className="text-green-600 mt-0.5 flex-shrink-0" size={18} />
                <div>
                  <span className="font-bold text-green-900 text-sm block">v0.n (n IMPAR)</span>
                  <span className="text-xs text-green-700">Envío a Coordinador (Ej: v0.1, v0.3). Estado: Revisión Interna.</span>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                <XCircle className="text-red-600 mt-0.5 flex-shrink-0" size={18} />
                <div>
                  <span className="font-bold text-red-900 text-sm block">v0.n (n PAR)</span>
                  <span className="text-xs text-red-700">Rechazo de Coordinador (Ej: v0.2, v0.4). Estado: Rechazado.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Revisión Referente */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-amber-50/50">
            <h2 className="text-lg font-bold text-amber-900 flex items-center gap-2">
              <Users size={20} />
              Revisión Referente (v1.n)
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-600">Utilizado para el flujo con el Referente Institucional.</p>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
                <CheckCircle2 className="text-blue-600 mt-0.5 flex-shrink-0" size={18} />
                <div>
                  <span className="font-bold text-blue-900 text-sm block">v1.0 / v1.n</span>
                  <span className="text-xs text-blue-700">Aprobación Interna y Envío a Referente.</span>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100">
                <Info className="text-amber-600 mt-0.5 flex-shrink-0" size={18} />
                <div>
                  <span className="font-bold text-amber-900 text-sm block">v1.n.i (i IMPAR)</span>
                  <span className="text-xs text-amber-700">Respuesta de Referente (Ej: v1.0.1).</span>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                <XCircle className="text-red-600 mt-0.5 flex-shrink-0" size={18} />
                <div>
                  <span className="font-bold text-red-900 text-sm block">v1.n.i (i PAR)</span>
                  <span className="text-xs text-red-700">Rechazo de Referente (Ej: v1.0.2). Estado: Rechazado.</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Reglas Especiales */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Settings className="text-slate-600" />
            Reglas de Transición y Sufijos
          </h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Sufijo AR</h3>
              <p className="text-xs text-slate-500">Indica que el documento ha sido enviado o revisado por Control de Calidad.</p>
              <div className="text-xs font-mono bg-slate-50 p-2 rounded border border-slate-100">v1.0AR, v1.0.1AR</div>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Sufijo ACG</h3>
              <p className="text-xs text-slate-500">Indica Aprobación Final por parte de la Coordinación General.</p>
              <div className="text-xs font-mono bg-slate-50 p-2 rounded border border-slate-100">v1.0ACG</div>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Proyecto REU</h3>
              <p className="text-xs text-slate-500">Utiliza el sufijo "PR" para indicar el documento final aprobado.</p>
              <div className="text-xs font-mono bg-slate-50 p-2 rounded border border-slate-100">... - PR.docx</div>
            </div>
          </div>
        </div>
      </section>

      {/* Ejemplo de Flujo */}
      <section className="bg-indigo-900 rounded-2xl shadow-lg p-8 text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-800 rounded-full -mr-32 -mt-32 opacity-50 blur-3xl"></div>
        <div className="relative z-10">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <ArrowRight />
            Ejemplo de Flujo de Trabajo
          </h2>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-indigo-700 flex items-center justify-center font-bold border-2 border-indigo-500 shadow-lg">0.1</div>
              <span className="text-[10px] uppercase font-bold tracking-widest opacity-70">Analista</span>
            </div>
            <ArrowRight className="hidden md:block opacity-30" />
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-indigo-700 flex items-center justify-center font-bold border-2 border-indigo-500 shadow-lg">v0.1</div>
              <span className="text-[10px] uppercase font-bold tracking-widest opacity-70">Revisión Int.</span>
            </div>
            <ArrowRight className="hidden md:block opacity-30" />
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center font-bold border-2 border-red-400 shadow-lg">v0.2</div>
              <span className="text-[10px] uppercase font-bold tracking-widest opacity-70">Rechazo</span>
            </div>
            <ArrowRight className="hidden md:block opacity-30" />
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-indigo-700 flex items-center justify-center font-bold border-2 border-indigo-500 shadow-lg">v0.3</div>
              <span className="text-[10px] uppercase font-bold tracking-widest opacity-70">Corrección</span>
            </div>
            <ArrowRight className="hidden md:block opacity-30" />
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center font-bold border-2 border-green-400 shadow-lg">v1.0</div>
              <span className="text-[10px] uppercase font-bold tracking-widest opacity-70">Aprobación</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default NomenclatureGuide;
