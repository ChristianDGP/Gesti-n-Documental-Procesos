import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DatabaseService } from '../services/firebaseBackend';
import { Download, Upload, Database, AlertTriangle, Save, FileSpreadsheet, RefreshCw, CheckSquare, Clock } from 'lucide-react';

const AdminDatabase: React.FC = () => {
  const navigate = useNavigate();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  // RESET & INIT STATE
  const [isResetting, setIsResetting] = useState(false);
  const [resetProgress, setResetProgress] = useState(0);
  const [resetStatus, setResetStatus] = useState<string>('Esperando inicio...');
  const [userConfirmed, setUserConfirmed] = useState(false); 
  
  const [rulesFile, setRulesFile] = useState<File | null>(null);
  const [historyFile, setHistoryFile] = useState<File | null>(null);
  
  const rulesInputRef = useRef<HTMLInputElement>(null);
  const historyInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const jsonString = await DatabaseService.exportData();
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().split('T')[0];
      a.download = `sgd_backup_${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert('Error al generar el respaldo.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleJsonRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    if (!window.confirm(`¿Restaurar desde "${file.name}"? Se perderán los datos actuales.`)) {
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
    }

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        await DatabaseService.importData(content);
        alert('Base de datos restaurada exitosamente.');
        navigate('/'); 
      } catch (error: any) {
        alert('Error al restaurar: ' + error.message);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteReset = async () => {
      if (!rulesFile) {
          alert("El archivo de Reglas/Estructura es obligatorio.");
          return;
      }
      // History file is optional but recommended
      
      if (!userConfirmed) {
          alert("Debe confirmar que entiende que se eliminarán los datos.");
          return;
      }

      setIsResetting(true);
      setResetProgress(1); 
      setResetStatus('Leyendo archivos locales...');

      setTimeout(async () => {
          try {
              // Read Rules
              const rulesContent = await readFileContent(rulesFile, 'ISO-8859-1');
              
              // Read History if available
              let historyContent = '';
              if (historyFile) {
                  historyContent = await readFileContent(historyFile, 'ISO-8859-1');
              }

              setResetStatus('Conectando con base de datos...');
              console.log("Iniciando carga híbrida...");
              
              const result = await DatabaseService.fullSystemResetAndImport(
                  rulesContent,
                  historyContent,
                  (percent, status) => {
                      console.log(`Progreso: ${percent}% - ${status}`);
                      setResetProgress(percent);
                      if (status) setResetStatus(status);
                  }
              );

              setResetStatus('¡Éxito! Redirigiendo...');
              setResetProgress(100);
              
              setTimeout(() => {
                  alert(`CARGA EXITOSA.\n\nMicroprocesos: ${result.created}\nDocumentos Históricos Vinculados: ${result.historyMatched}`);
                  navigate('/'); 
              }, 500);

          } catch (error: any) {
              console.error(error);
              setResetStatus('Error Crítico: ' + error.message);
              setIsResetting(false); 
              alert("Error durante la carga: " + error.message);
          }
      }, 200);
  };

  const readFileContent = (file: File, encoding: string = 'UTF-8'): Promise<string> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = (e) => reject(e);
          reader.readAsText(file, encoding);
      });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="text-indigo-600" />
            Base de Datos
          </h1>
          <p className="text-slate-500">Gestión de respaldos, recuperación y migración de datos.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Card 1: Backup */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4 text-green-600">
                <Download size={24} />
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">Generar Respaldo</h2>
            <p className="text-sm text-slate-500 mb-6">
                Descarga una copia completa de la base de datos actual (JSON).
            </p>
            <button 
                onClick={handleExport}
                disabled={isExporting}
                className="w-full flex items-center justify-center px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium shadow-sm disabled:opacity-70"
            >
                {isExporting ? 'Generando...' : (
                    <>
                        <Save size={18} className="mr-2" />
                        Descargar JSON
                    </>
                )}
            </button>
        </div>

        {/* Card 2: Restore JSON */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-4 text-orange-600">
                <Upload size={24} />
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">Restaurar Sistema (JSON)</h2>
            <p className="text-sm text-slate-500 mb-6">
                Sube un archivo de respaldo (.json) para restaurar el sistema. 
            </p>
            
            <input 
                type="file" 
                ref={fileInputRef}
                accept=".json"
                onChange={handleJsonRestore}
                className="hidden"
            />
            
            <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="w-full flex items-center justify-center px-4 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors font-medium shadow-sm disabled:opacity-70"
            >
                {isImporting ? 'Restaurando...' : (
                    <>
                        <Upload size={18} className="mr-2" />
                        Subir Respaldo
                    </>
                )}
            </button>
        </div>

        {/* MAIN CARD: FULL SYSTEM RESET */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-red-200 md:col-span-2 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>
            <div className="flex flex-col md:flex-row gap-8">
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                            <RefreshCw size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">Carga Híbrida (Reglas + Histórico)</h2>
                            <p className="text-sm text-red-600 font-semibold flex items-center gap-1">
                                <AlertTriangle size={14} /> Reset Total + Estructura + Estado Actual
                            </p>
                        </div>
                    </div>
                    
                    <p className="text-sm text-slate-600 mb-6">
                        Este proceso <b>borra todo</b> y reconstruye el sistema usando dos fuentes:
                        <ul className="list-disc pl-5 mt-2 space-y-1">
                            <li><b>Reglas:</b> Define la estructura del árbol y los documentos obligatorios.</li>
                            <li><b>Histórico:</b> Define la versión, fecha y estado actual de cada documento.</li>
                        </ul>
                    </p>

                    <div className="space-y-4">
                        {/* File 1: Rules */}
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-bold text-slate-700 flex items-center gap-2"><FileSpreadsheet size={16}/> 1. CSV Reglas (Estructura)</span>
                                {rulesFile ? <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded">Cargado</span> : <span className="text-xs text-red-400 font-medium">Priorizado</span>}
                            </div>
                            <div className="text-xs text-slate-500 mb-3">
                                <p>Macro; Proceso; Micro; Analista; Proyecto;</p>
                                <p>ASIS; FCE; PM; TOBE (Flags 0/1)</p>
                            </div>
                            <div className="flex gap-3 items-center">
                                <input 
                                    type="file" 
                                    ref={rulesInputRef}
                                    accept=".csv,.txt"
                                    onChange={(e) => setRulesFile(e.target.files?.[0] || null)}
                                    className="hidden"
                                />
                                <button 
                                    onClick={() => rulesInputRef.current?.click()}
                                    className="px-3 py-1.5 bg-white border border-slate-300 text-slate-600 text-xs rounded hover:bg-slate-50 font-medium"
                                >
                                    Seleccionar Archivo
                                </button>
                                <span className="text-xs text-slate-500 truncate max-w-[200px]">{rulesFile?.name || '...'}</span>
                            </div>
                        </div>

                        {/* File 2: History */}
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-bold text-slate-700 flex items-center gap-2"><Clock size={16}/> 2. CSV Histórico (Estado)</span>
                                {historyFile ? <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded">Cargado</span> : <span className="text-xs text-slate-400 font-medium">Opcional</span>}
                            </div>
                            <div className="text-xs text-slate-500 mb-3">
                                <p>Proyecto; Macro; Proceso; Micro;</p>
                                <p>Ver/Fecha (ASIS); Ver/Fecha (FCE); ...</p>
                            </div>
                            <div className="flex gap-3 items-center">
                                <input 
                                    type="file" 
                                    ref={historyInputRef}
                                    accept=".csv,.txt"
                                    onChange={(e) => setHistoryFile(e.target.files?.[0] || null)}
                                    className="hidden"
                                />
                                <button 
                                    onClick={() => historyInputRef.current?.click()}
                                    className="px-3 py-1.5 bg-white border border-slate-300 text-slate-600 text-xs rounded hover:bg-slate-50 font-medium"
                                >
                                    Seleccionar Archivo
                                </button>
                                <span className="text-xs text-slate-500 truncate max-w-[200px]">{historyFile?.name || '...'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col justify-center items-center md:w-1/3 gap-4 border-l border-slate-100 md:pl-6">
                     <div className="bg-indigo-50 p-3 rounded text-xs text-indigo-800 w-full mb-2">
                        <p className="font-bold mb-1 border-b border-indigo-100 pb-1">El proceso realizará:</p>
                        <ol className="list-decimal pl-4 space-y-1 mt-1">
                            <li>Eliminar Base de Datos actual.</li>
                            <li>Crear estructura base desde (1).</li>
                            <li>Actualizar estado/fecha desde (2).</li>
                            <li>Si no hay (2), inicia en 0.0.</li>
                        </ol>
                     </div>

                     <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer p-2 rounded hover:bg-slate-50 w-full">
                        <div className="relative flex items-center">
                            <input 
                                type="checkbox" 
                                checked={userConfirmed}
                                onChange={(e) => setUserConfirmed(e.target.checked)}
                                disabled={isResetting}
                                className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-slate-300 shadow-sm checked:bg-red-600 checked:border-red-600"
                            />
                            <CheckSquare className="absolute w-4 h-4 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" size={12} />
                        </div>
                        <span>Confirmo <b>eliminar datos</b> y recargar.</span>
                     </label>

                     <button 
                        onClick={handleExecuteReset}
                        disabled={isResetting || !rulesFile || !userConfirmed}
                        className={`w-full flex items-center justify-center px-4 py-3 rounded-lg transition-all font-bold shadow-md text-white text-sm
                            ${(rulesFile && userConfirmed) 
                                ? 'bg-red-600 hover:bg-red-700 hover:shadow-lg transform active:scale-95' 
                                : 'bg-slate-300 cursor-not-allowed opacity-70'}`}
                    >
                        {isResetting ? (
                            <span className="flex items-center animate-pulse">
                                <RefreshCw size={16} className="animate-spin mr-2" /> PROCESANDO...
                            </span>
                        ) : 'EJECUTAR CARGA'}
                    </button>
                    
                    {/* Barra de Progreso */}
                    {isResetting && (
                        <div className="w-full bg-white p-3 rounded-lg border border-red-100 shadow-sm mt-2 transition-all duration-300">
                             <div className="flex justify-between text-xs text-red-700 font-bold mb-2">
                                <span>Progreso</span>
                                <span>{resetProgress}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
                                <div 
                                    className="bg-red-500 h-3 rounded-full transition-all duration-300 ease-out" 
                                    style={{ width: `${resetProgress}%` }}
                                ></div>
                            </div>
                            <p className="text-[10px] text-center text-slate-500 mt-2 font-mono bg-slate-50 p-1 rounded border border-slate-100 truncate">
                                {resetStatus}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default AdminDatabase;