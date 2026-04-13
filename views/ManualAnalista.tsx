
import React from 'react';
import { 
  Book, FileText, Upload, CheckCircle, AlertTriangle, Info, 
  Download, Printer, ArrowLeft, Layers, Mail, History, HelpCircle,
  BookOpen, CheckCircle2, XCircle, ArrowRight, Users, Settings
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ManualAnalista: React.FC = () => {
  const navigate = useNavigate();

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-5xl mx-auto pb-20 animate-fadeIn">
      {/* Cabecera - Oculta en impresión */}
      <div className="flex justify-between items-center mb-6 print:hidden">
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center text-slate-500 hover:text-slate-800 text-sm font-medium"
        >
          <ArrowLeft size={16} className="mr-1" /> Volver
        </button>
        <button 
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md font-bold transition-all"
        >
          <Printer size={18} />
          Descargar Manual (PDF)
        </button>
      </div>

      {/* Contenido del Manual */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none">
        
        {/* Portada del Manual */}
        <div className="bg-slate-900 p-12 text-white text-center">
          <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl">
            < Book size={40} />
          </div>
          <h1 className="text-3xl font-bold mb-2">Manual de Usuario - Analista</h1>
          <p className="text-indigo-300 font-medium uppercase tracking-widest text-sm">Sistema de Gestión Documental (SGD)</p>
          <div className="mt-8 pt-8 border-t border-slate-800 text-slate-400 text-xs">
            Versión 1.0 - Actualizado 2025
          </div>
        </div>

        <div className="p-8 md:p-12 space-y-12">
          
          {/* 1. Introducción */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2 border-b pb-2">
              <Info className="text-indigo-600" size={24} />
              1. Introducción
            </h2>
            <p className="text-slate-600 leading-relaxed">
              El SGD es la plataforma centralizada para la gestión y aprobación de documentos. Como Analista, su función es la elaboración de informes en el repositorio dispuesto para este fin. El seguimiento de sus versiones y la respuesta a las observaciones del coordinador se realiza en esta plataforma.
            </p>
          </section>

          {/* 2. El Ciclo de Vida del Documento */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2 border-b pb-2">
              <Layers className="text-indigo-600" size={24} />
              2. Estados del Documento
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StateInfo label="Iniciado (0.0)" desc="Documento recién creado, aún sin contenido técnico avanzado." />
              <StateInfo label="En Proceso (0.n)" desc="Fase de elaboración. El analista sube avances periódicos." />
              <StateInfo label="Revisión Interna (v0.n)" desc="Enviado al Coordinador para validación previa." />
              <StateInfo label="Referente (v1.n.i / v0.n.i)" desc="Enviado a referentes. Para REU se mantiene v0.n.i." />
              <StateInfo label="Control Gestión (v1.n.iAR)" desc="Enviado a Control de gestión para su visto bueno." />
              <StateInfo label="Aprobado (v1.nACG / PR)" desc="Documento Terminado y archivado formalmente. Para REU se usa 'PR' al final." />
            </div>
          </section>

          {/* 3. Reglas de Nomenclatura (DETALLADO) */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <FileText className="text-indigo-600" />
                3. Estructura del Nombre de Archivo
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
                  <p className="text-xs text-slate-500">Indica que el documento ha sido enviado o revisado por Control de Gestión.</p>
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

          {/* 4. Carga de Documentos */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2 border-b pb-2">
              <Upload className="text-indigo-600" size={24} />
              4. ¿Cómo subir un documento?
            </h2>
            <ol className="space-y-4 list-decimal pl-5 text-slate-600">
              <li>Diríjase a <strong>"Nueva Solicitud"</strong>.</li>
              <li>Seleccione Proyecto, Macroproceso y el Microproceso asignado.</li>
              <li>Seleccione el <strong>Tipo de Informe</strong> (AS IS, FCE, etc.).</li>
              <li><strong>Importante:</strong> Elija la "Etapa" correcta del flujo (Ej: En Proceso).</li>
              <li>Suba el archivo. El sistema verificará que la versión coincida con la etapa.</li>
              <li>Haga clic en <strong>"Cargar Documento"</strong>.</li>
            </ol>
          </section>

          {/* 5. Comunicación y Observaciones */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2 border-b pb-2">
              <Mail className="text-indigo-600" size={24} />
              5. Notificaciones y Correos
            </h2>
            <p className="text-slate-600 text-sm mb-4">
              Dentro del detalle de cada documento, usted puede:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <h5 className="font-bold text-indigo-600 flex items-center gap-2 mb-1">
                  <Mail size={16} /> Notificar al Coordinador
                </h5>
                <p className="text-xs text-slate-500">Abre un borrador en Gmail con el enlace directo al documento para solicitar revisión.</p>
              </div>
              <div className="p-4 border rounded-lg">
                <h5 className="font-bold text-indigo-600 flex items-center gap-2 mb-1">
                  <History size={16} /> Ver Historial
                </h5>
                <p className="text-xs text-slate-500">Consulte cada cambio de estado, comentarios y quién realizó la última modificación.</p>
              </div>
            </div>
          </section>

          {/* Footer del documento */}
          <div className="pt-12 border-t border-slate-100 text-center">
            <p className="text-slate-400 text-xs">© 2025 Sistema de Gestión Documental - Reservado para uso institucional.</p>
          </div>

        </div>
      </div>
      
      {/* Estilos para impresión */}
      <style>{`
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:border-none { border: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          .max-w-5xl { max-width: 100% !important; }
        }
      `}</style>
    </div>
  );
};

const StateInfo = ({ label, desc }: { label: string, desc: string }) => (
  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
    <div className="font-bold text-indigo-700 text-sm mb-1">{label}</div>
    <p className="text-xs text-slate-500 leading-tight">{desc}</p>
  </div>
);

export default ManualAnalista;
