import React, { useState } from 'react';
import { SavedProcessEntry, UpProcess } from '../../types/upEngine';
import { UpEngineService, normalizeProcessId } from '../../services/upEngineService';
import {
  X, Search, Plus, Trash2, Edit3, Download, Upload, Check,
  AlertTriangle, RefreshCw, Layers, Shield, FileText
} from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  processes: SavedProcessEntry[];
  activeProcessId: string;
  onSelectProcess: (process: SavedProcessEntry) => void;
}

export const LibraryManagerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  processes,
  activeProcessId,
  onSelectProcess
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingProcess, setEditingProcess] = useState<UpProcess | null>(null);
  const [showForm, setShowForm] = useState(false);

  if (!isOpen) return null;

  const filteredProcesses = processes.filter(
    (p) =>
      p.process.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.process.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDeleteSingle = async (entry: SavedProcessEntry) => {
    if (!window.confirm(`¿Está seguro de eliminar el proceso "${entry.process.name}" de la nube?`)) return;
    setLoading(true);
    try {
      await UpEngineService.deleteProcess(entry.id);
      toast.success('Proceso eliminado de Firestore correctamente.');
    } catch (err: any) {
      toast.error('Error al eliminar proceso: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = async () => {
    if (
      !window.confirm(
        '¿ATENCIÓN: Está seguro de VACIAR TODA LA LIBRERÍA de la nube Firestore? Esta acción eliminará permanentemente todos los modelos normativos registrados.'
      )
    )
      return;

    setLoading(true);
    try {
      await UpEngineService.clearAllProcesses(processes);
      toast.success('Librería vaciada de Firestore.');
    } catch (err: any) {
      toast.error('Error al vaciar librería: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportJSON = () => {
    const dataStr = JSON.stringify(processes, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `UpEngine_Library_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    toast.success('Respaldo JSON exportado.');
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json)) {
          setLoading(true);
          for (const item of json) {
            if (item.process && item.process.name) {
              const docId = item.id || normalizeProcessId(item.process.name);
              await UpEngineService.saveProcess({
                id: docId,
                savedAt: new Date().toLocaleString('es-CL'),
                process: item.process
              });
            }
          }
          toast.success('Respaldo JSON importado y sincronizado con Firestore.');
        } else {
          toast.error('Formato JSON no válido.');
        }
      } catch (err: any) {
        toast.error('Error al parsear archivo JSON: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProcess || !editingProcess.name.trim()) {
      toast.error('Ingrese un nombre válido para el proceso.');
      return;
    }

    setLoading(true);
    try {
      const docId = normalizeProcessId(editingProcess.name);
      await UpEngineService.saveProcess({
        id: docId,
        savedAt: new Date().toLocaleString('es-CL'),
        process: {
          ...editingProcess,
          id: docId,
          lastUpdated: new Date().toISOString().split('T')[0]
        }
      });
      toast.success('Proceso guardado en Firestore.');
      setShowForm(false);
      setEditingProcess(null);
    } catch (err: any) {
      toast.error('Error al guardar proceso: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openNewForm = () => {
    setEditingProcess({
      id: '',
      name: '',
      description: '',
      version: '1.0.0',
      lastUpdated: new Date().toISOString().split('T')[0],
      asIsContext: '',
      toBeOptimizations: '',
      fceFactors: ['Estandarización de procesos', 'Capacitación de personal'],
      stages: [
        {
          id: 'stg_1',
          number: 1,
          name: 'Recepción Inicial',
          description: 'Verificación de documentación',
          responsibleRole: 'Encargado de Recepción',
          substeps: ['Validar folio', 'Registrar fecha'],
          criticalControlPoints: ['Control de firma'],
          estimatedTimeMinutes: 15,
          failureImpact: 'HIGH'
        }
      ],
      governanceRules: [
        {
          id: 'gov_1',
          code: 'NORM-01',
          title: 'Verificación Obligatoria',
          description: 'Requisito de cumplimiento',
          severity: 'HIGH',
          enforcementType: 'BLOCKING'
        }
      ],
      roles: [
        { id: 'role_1', name: 'Encargado de Recepción', responsibilities: ['Validación inicial'] }
      ],
      integrations: [
        {
          id: 'int_1',
          systemName: 'Sistema Central',
          protocol: 'REST API',
          endpoint: '/api/v1/process',
          authentication: 'Bearer Token'
        }
      ]
    });
    setShowForm(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Layers size={20} className="text-indigo-600" />
              Gestión de Librería de Procesos (Cloud Firestore)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Administre, edite, respalde o elimine modelos normativos sincronizados en la nube.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {!showForm ? (
            <>
              {/* Action Toolbar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative w-full sm:w-80">
                  <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar proceso..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={openNewForm}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                  >
                    <Plus size={16} />
                    <span>Nuevo Proceso</span>
                  </button>

                  <button
                    onClick={handleExportJSON}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200"
                  >
                    <Download size={15} />
                    <span>Exportar</span>
                  </button>

                  <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200 cursor-pointer">
                    <Upload size={15} />
                    <span>Importar</span>
                    <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
                  </label>

                  <button
                    onClick={handleClearAll}
                    disabled={processes.length === 0 || loading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-all border border-rose-200 disabled:opacity-50"
                  >
                    <Trash2 size={15} />
                    <span>Vaciar Librería</span>
                  </button>
                </div>
              </div>

              {/* Process Cards List */}
              {loading ? (
                <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                  <RefreshCw className="animate-spin mb-2 text-indigo-600" size={24} />
                  Sincronizando con Cloud Firestore...
                </div>
              ) : filteredProcesses.length === 0 ? (
                <div className="p-12 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  No se encontraron procesos en la librería.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredProcesses.map((item) => {
                    const isActive = item.id === activeProcessId;
                    return (
                      <div
                        key={item.id}
                        className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                          isActive
                            ? 'border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-500/20 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                            <span className="font-mono text-[10px] text-indigo-600 font-bold truncate max-w-[200px]">
                              {item.id}
                            </span>
                            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-bold">
                              v{item.process.version}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-900 leading-tight">{item.process.name}</h4>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.process.description}</p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <span className="text-[10px] text-slate-400 font-mono">
                            {item.process.stages?.length || 0} etapas | {item.process.governanceRules?.length || 0} reglas
                          </span>

                          <div className="flex items-center gap-1.5">
                            {!isActive && (
                              <button
                                onClick={() => {
                                  onSelectProcess(item);
                                  onClose();
                                }}
                                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all"
                              >
                                Seleccionar
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setEditingProcess(item.process);
                                setShowForm(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                              title="Editar"
                            >
                              <Edit3 size={16} />
                            </button>

                            <button
                              onClick={() => handleDeleteSingle(item)}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                              title="Eliminar"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* Manual Process Editor Form */
            <form onSubmit={handleSaveForm} className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h4 className="text-sm font-bold text-slate-900">
                  {editingProcess?.id ? 'Editar Proceso Normativo' : 'Crear Nuevo Proceso Manual'}
                </h4>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-xs font-bold text-indigo-600 hover:underline"
                >
                  Volver a la Lista
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nombre del Proceso</label>
                  <input
                    type="text"
                    required
                    value={editingProcess?.name || ''}
                    onChange={(e) =>
                      setEditingProcess((prev) => (prev ? { ...prev, name: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Versión</label>
                  <input
                    type="text"
                    required
                    value={editingProcess?.version || '1.0.0'}
                    onChange={(e) =>
                      setEditingProcess((prev) => (prev ? { ...prev, version: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Descripción Ejecutiva</label>
                  <textarea
                    rows={2}
                    value={editingProcess?.description || ''}
                    onChange={(e) =>
                      setEditingProcess((prev) => (prev ? { ...prev, description: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Diagnóstico Actual (AS-IS)</label>
                  <textarea
                    rows={2}
                    value={editingProcess?.asIsContext || ''}
                    onChange={(e) =>
                      setEditingProcess((prev) => (prev ? { ...prev, asIsContext: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Optimización Meta (TO-BE)</label>
                  <textarea
                    rows={2}
                    value={editingProcess?.toBeOptimizations || ''}
                    onChange={(e) =>
                      setEditingProcess((prev) => (prev ? { ...prev, toBeOptimizations: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
                >
                  {loading ? 'Guardando...' : 'Guardar Proceso en Firestore'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
