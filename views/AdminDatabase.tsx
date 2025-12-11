
import React, { useState, useRef } from 'react';
import { DatabaseService } from '../services/firebaseBackend';
import { Download, Upload, Database, AlertTriangle, CheckCircle, Save, FileSpreadsheet } from 'lucide-react';

const AdminDatabase: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isLegacyImporting, setIsLegacyImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const legacyInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    if (!window.confirm(`¿Estás seguro de que deseas restaurar la base de datos desde "${file.name}"?\n\nESTA ACCIÓN SOBREESCRIBIRÁ TODOS LOS DATOS ACTUALES Y NO SE PUEDE DESHACER.`)) {
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
    }

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        await DatabaseService.importData(content);
        alert('Base de datos restaurada exitosamente. El sistema se recargará.');
        window.location.reload();
      } catch (error: any) {
        alert('Error al restaurar: ' + error.message);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  const handleLegacyFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    if (!window.confirm(`ATENCIÓN: IMPORTACIÓN HISTÓRICA (MIGRACIÓN)\n\nAl importar desde "${file.name}":\n\n1. SE ELIMINARÁN TODOS LOS DOCUMENTOS ACTUALES.\n2. Se limpiará el historial de versiones.\n3. Se poblará la base de datos exclusivamente con la información del archivo CSV.\n\n¿Desea continuar con esta operación destructiva?`)) {
        if (legacyInputRef.current) legacyInputRef.current.value = '';
        return;
    }

    setIsLegacyImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const content = event.target?.result as string;
            const result = await DatabaseService.importLegacyFromCSV(content);
            alert(`Importación completada exitosamente.\n\nBase de datos limpiada y regenerada.\nDocumentos creados: ${result.imported}\nErrores: ${result.errors.length}`);
            window.location.reload();
        } catch (error: any) {
            alert('Error en importación legacy: ' + error.message);
            if (legacyInputRef.current) legacyInputRef.current.value = '';
            setIsLegacyImporting(false);
        }
    };
    reader.readAsText(file); // Reads as text (CSV/TSV)
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
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
        {/* Backup Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4 text-green-600">
                <Download size={24} />
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">Generar Respaldo</h2>
            <p className="text-sm text-slate-500 mb-6">
                Descarga una copia completa de la base de datos actual (usuarios, documentos, historial y configuración) en formato JSON.
            </p>
            <button 
                onClick={handleExport}
                disabled={isExporting}
                className="w-full flex items-center justify-center px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium shadow-sm disabled:opacity-70"
            >
                {isExporting ? 'Generando...' : (
                    <>
                        <Save size={18} className="mr-2" />
                        Descargar Base de Datos
                    </>
                )}
            </button>
        </div>

        {/* Restore Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-4 text-orange-600">
                <Upload size={24} />
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">Restaurar Sistema</h2>
            <p className="text-sm text-slate-500 mb-6">
                Sube un archivo de respaldo (.json) para restaurar el sistema a un estado anterior. 
            </p>
            
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-4 flex items-start gap-2">
                <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-700">
                    Advertencia: Esta acción eliminará todos los datos actuales y los reemplazará con los del respaldo.
                </p>
            </div>

            <input 
                type="file" 
                ref={fileInputRef}
                accept=".json"
                onChange={handleFileSelect}
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

        {/* Legacy Import Card (New) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 md:col-span-2">
            <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4 text-blue-600">
                        <FileSpreadsheet size={24} />
                    </div>
                    <h2 className="text-lg font-bold text-slate-800 mb-2">Importar desde Excel Histórico (Migración)</h2>
                    <p className="text-sm text-slate-500 mb-4">
                        Carga el archivo Excel de gestión documental histórica (formato CSV/TSV) para poblar la base de datos inicial.
                    </p>
                    <ul className="text-xs text-slate-500 list-disc pl-4 space-y-1 mb-4">
                        <li>El archivo debe contener las columnas de Jerarquía (Proyecto, Macro, Proceso, Micro).</li>
                        <li>Debe incluir las columnas de estado para AS IS, FCE, PM y TO BE.</li>
                        <li>Se recomienda guardar el Excel como "CSV (delimitado por punto y coma)" antes de subir.</li>
                    </ul>
                </div>
                <div className="flex items-center justify-center md:w-1/3">
                     <input 
                        type="file" 
                        ref={legacyInputRef}
                        accept=".csv,.txt"
                        onChange={handleLegacyFileSelect}
                        className="hidden"
                    />
                     <button 
                        onClick={() => legacyInputRef.current?.click()}
                        disabled={isLegacyImporting}
                        className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium shadow-sm disabled:opacity-70"
                    >
                        {isLegacyImporting ? 'Procesando...' : (
                            <>
                                <Upload size={18} className="mr-2" />
                                Subir Excel/CSV
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDatabase;
