
import React from 'react';
import { 
  Book, FileText, Upload, CheckCircle, AlertTriangle, Info, 
  Download, Printer, ArrowLeft, Layers, Mail, History, HelpCircle
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
              <StateInfo label="Referente (v1.n.i)" desc="Enviado a referentes para su visto bueno." />
              <StateInfo label="Control Gestión (v1.n.iAR)" desc="Enviado a Control de gestión para su visto bueno." />
              <StateInfo label="Aprobado (v1.nACG)" desc="Documento Terminado y archivado formalmente en repositorio de documentos aprobados." />
            </div>
          </section>

          {/* 3. Reglas de Nomenclatura (CRÍTICO) */}
          <section className="bg-slate-50 p-6 rounded-xl border border-slate-200">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <AlertTriangle className="text-amber-500" size={24} />
              3. Reglas de Nomenclatura (Obligatorio)
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              El sistema valida estrictamente el nombre de cada archivo. Si el nombre no cumple el formato, <strong>no podrá cargarlo</strong>.
            </p>
            <div className="bg-white p-4 rounded-lg font-mono text-sm border border-slate-200 mb-4">
              PROYECTO - Microproceso - TIPO - Versión
            </div>
            <div className="space-y-3">
              <div className="flex gap-2 text-sm">
                <span className="font-bold text-indigo-600 min-w-[100px]">Proyecto:</span>
                <span className="text-slate-600">Debe ser "HPC" o "HSR".</span>
              </div>
              <div className="flex gap-2 text-sm">
                <span className="font-bold text-indigo-600 min-w-[100px]">Tipo:</span>
                <span className="text-slate-600">ASIS, FCE, PM o TOBE (sin espacios).</span>
              </div>
              <div className="flex gap-2 text-sm">
                <span className="font-bold text-indigo-600 min-w-[100px]">Ejemplo:</span>
                <span className="text-slate-700 italic">HPC - Gestión de Citas - ASIS - 0.1</span>
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
