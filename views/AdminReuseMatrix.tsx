
import React, { useState, useEffect, useMemo } from 'react';
import { HierarchyService, DocumentService, normalizeHeader } from '../services/firebaseBackend';
import { FullHierarchy, ProcessNode, User, UserRole, Document, DocState, DocType } from '../types';
import { STATE_CONFIG } from '../constants';
import { 
  Link as LinkIcon, Search, ChevronRight, ChevronDown, Plus, X, Save, Layers, Network, FolderOpen, FileText, Loader2, AlertCircle, Info, Trash2, ArrowRight, CheckSquare, Square, List, ExternalLink
} from 'lucide-react';

interface Props {
    user: User;
}

const AdminReuseMatrix: React.FC<Props> = ({ user }) => {
  const [hierarchy, setHierarchy] = useState<FullHierarchy>({});
  const [allDocs, setAllDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'LINK' | 'VIEW'>('LINK');
  
  // Selection State: The REU microprocess being managed
  const [selectedReuId, setSelectedReuId] = useState<string | null>(null);

  // Search States
  const [searchTerm, setSearchTerm] = useState('');
  const [treeSearchTerm, setTreeSearchTerm] = useState('');
  const [viewSearchTerm, setViewSearchTerm] = useState('');

  // Permission: Admin, or anyone with the specific flag
  const canManage = user.role === UserRole.ADMIN || user.canAccessReuseMatrix;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
        const [h, docs] = await Promise.all([
            HierarchyService.getFullHierarchy(),
            DocumentService.getAll()
        ]);
        setHierarchy(h);
        setAllDocs(docs);
    } catch (e) {
        console.error("Error loading data:", e);
    } finally {
        setLoading(false);
    }
  };

  // Map of documents for quick lookup
  const docMap = useMemo(() => {
      const map: Record<string, Document> = {};
      allDocs.forEach(doc => {
          if (doc.project && (doc.microprocess || doc.title)) {
              const microName = doc.microprocess || doc.title.split(' - ')[0] || doc.title;
              const docType = doc.docType || 'AS IS';
              const key = `${normalizeHeader(doc.project)}|${normalizeHeader(microName)}|${normalizeHeader(docType)}`;
              
              const existing = map[key];
              if (!existing || new Date(doc.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
                  map[key] = { ...doc, microprocess: microName, docType: docType as DocType };
              }
          }
      });
      return map;
  }, [allDocs]);

  // Get all REU microprocesses
  const reuMicroprocesses = useMemo(() => {
      const list: { id: string, name: string, macro: string, process: string }[] = [];
      const reu = hierarchy['REU'];
      if (!reu) return list;

      Object.keys(reu).forEach(macro => {
          Object.keys(reu[macro]).forEach(process => {
              reu[macro][process].forEach(node => {
                  list.push({
                      id: node.docId,
                      name: node.name,
                      macro,
                      process
                  });
              });
          });
      });
      return list;
  }, [hierarchy]);

  // Find which microprocesses use the selected REU
  const linkedProcessIds = useMemo(() => {
      if (!selectedReuId) return new Set<string>();
      const linked = new Set<string>();
      
      Object.keys(hierarchy).forEach(proj => {
          if (proj === 'REU') return;
          Object.keys(hierarchy[proj]).forEach(macro => {
              Object.keys(hierarchy[proj][macro]).forEach(process => {
                  hierarchy[proj][macro][process].forEach(node => {
                      if (node.reusableLinks?.includes(selectedReuId)) {
                          linked.add(node.docId);
                      }
                  });
              });
          });
      });
      return linked;
  }, [hierarchy, selectedReuId]);

  // Map of REU ID to list of microprocesses using it
  const reuUsageMap = useMemo(() => {
      const map: Record<string, { proj: string, macro: string, process: string, name: string, id: string }[]> = {};
      
      reuMicroprocesses.forEach(reu => {
          map[reu.id] = [];
      });

      Object.keys(hierarchy).forEach(proj => {
          if (proj === 'REU') return;
          Object.keys(hierarchy[proj]).forEach(macro => {
              Object.keys(hierarchy[proj][macro]).forEach(process => {
                  hierarchy[proj][macro][process].forEach(node => {
                      if (node.reusableLinks && node.reusableLinks.length > 0) {
                          node.reusableLinks.forEach(reuId => {
                              if (map[reuId]) {
                                  map[reuId].push({
                                      proj,
                                      macro,
                                      process,
                                      name: node.name,
                                      id: node.docId
                                  });
                              }
                          });
                      }
                  });
              });
          });
      });
      return map;
  }, [hierarchy, reuMicroprocesses]);

  const handleToggleLink = async (targetDocId: string, currentLinks: string[] = []) => {
      if (!selectedReuId) return;
      
      setSavingId(targetDocId);
      try {
          let newLinks: string[];
          if (currentLinks.includes(selectedReuId)) {
              newLinks = currentLinks.filter(id => id !== selectedReuId);
          } else {
              newLinks = [...currentLinks, selectedReuId];
          }
          
          await HierarchyService.updateReusableLinks(targetDocId, newLinks);
          await loadData();
      } catch (err: any) {
          alert('Error al actualizar vínculo: ' + err.message);
      } finally {
          setSavingId(null);
      }
  };

  if (!canManage) {
      return (
          <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
              <AlertCircle size={48} className="mb-4 opacity-20" />
              <p className="font-bold">Acceso Restringido</p>
              <p className="text-sm">Solo administradores pueden gestionar la matriz de reutilización.</p>
          </div>
      );
  }

  const otherProjects = Object.keys(hierarchy).filter(p => p !== 'REU');

  return (
    <div className="max-w-7xl mx-auto pb-20 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <LinkIcon className="text-indigo-600" size={28} />
            Matriz Reutilizables
          </h1>
          <p className="text-slate-500 text-sm">Administre y visualice la relación entre componentes REU y microprocesos base.</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            <button 
                onClick={() => setActiveTab('LINK')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'LINK' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <CheckSquare size={14} />
                Vincular
            </button>
            <button 
                onClick={() => setActiveTab('VIEW')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'VIEW' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <List size={14} />
                Visualizar
            </button>
            <div className="w-px h-4 bg-slate-200 mx-1"></div>
            <button 
                onClick={loadData}
                className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                title="Refrescar"
            >
                <Loader2 size={16} className={loading ? 'animate-spin' : ''} />
            </button>
        </div>
      </div>

      {activeTab === 'LINK' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Panel Izquierdo: Lista de REU */}
            <div className="lg:col-span-4 space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[70vh]">
                    <div className="p-4 bg-slate-50 border-b border-slate-200">
                        <div className="flex items-center gap-2 mb-3">
                            <FolderOpen size={16} className="text-indigo-500" />
                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Componentes REU</span>
                        </div>
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="text" 
                                placeholder="Buscar REU..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {reuMicroprocesses
                            .filter(reu => !searchTerm || reu.name.toLowerCase().includes(searchTerm.toLowerCase()))
                            .map(reu => (
                            <button 
                                key={reu.id}
                                onClick={() => setSelectedReuId(reu.id)}
                                className={`w-full text-left p-3 rounded-xl transition-all border ${selectedReuId === reu.id ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'hover:bg-slate-50 border-transparent'}`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className={`text-xs font-bold ${selectedReuId === reu.id ? 'text-indigo-700' : 'text-slate-700'}`}>{reu.name}</span>
                                    {selectedReuId === reu.id && <ChevronRight size={14} className="text-indigo-400" />}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{reu.macro}</span>
                                    <span className="text-slate-300">•</span>
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">{reu.process}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Panel Derecho: Árbol de Proyectos para marcar relación */}
            <div className="lg:col-span-8">
                {!selectedReuId ? (
                    <div className="bg-white rounded-3xl border border-slate-200 border-dashed h-[70vh] text-center flex flex-col items-center justify-center text-slate-400">
                        <LinkIcon size={64} className="mb-4 opacity-10" />
                        <p className="font-medium">Seleccione un componente REU</p>
                        <p className="text-xs mt-1">Para marcar qué microprocesos lo utilizan</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[70vh]">
                        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                                        <CheckSquare size={18} className="text-indigo-500" />
                                        Vincular a Proyectos Base
                                    </h3>
                                    <p className="text-[10px] text-slate-500 mt-1">
                                        Marcando un microproceso, este componente REU aparecerá como referencia en su detalle.
                                    </p>
                                </div>
                                <div className="relative w-full md:w-64">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input 
                                        type="text" 
                                        placeholder="Filtrar proyectos/procesos..." 
                                        value={treeSearchTerm}
                                        onChange={(e) => setTreeSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="space-y-6">
                                {otherProjects.map(proj => (
                                    <div key={proj} className="space-y-3">
                                        <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                            <Network size={16} className="text-slate-400" />
                                            <span className="text-xs font-black text-slate-800 uppercase tracking-widest">{proj}</span>
                                        </div>
                                        
                                        <div className="grid grid-cols-1 gap-4">
                                            {Object.keys(hierarchy[proj]).map(macro => (
                                                <div key={macro} className="bg-slate-50/50 rounded-xl border border-slate-100 p-4">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <Layers size={14} className="text-indigo-400" />
                                                        <span className="text-[11px] font-bold text-slate-600 uppercase">{macro}</span>
                                                    </div>
                                                    
                                                    <div className="space-y-4 ml-2">
                                                        {Object.keys(hierarchy[proj][macro]).map(process => (
                                                            <div key={process} className="space-y-2">
                                                                <div className="flex items-center gap-2">
                                                                    <FolderOpen size={12} className="text-slate-300" />
                                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{process}</span>
                                                                </div>
                                                                
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 ml-4">
                                                                    {hierarchy[proj][macro][process]
                                                                        .filter(node => !treeSearchTerm || node.name.toLowerCase().includes(treeSearchTerm.toLowerCase()))
                                                                        .map(node => {
                                                                        const isLinked = linkedProcessIds.has(node.docId);
                                                                        const isSaving = savingId === node.docId;
                                                                        
                                                                        return (
                                                                            <button 
                                                                                key={node.docId}
                                                                                onClick={() => handleToggleLink(node.docId, node.reusableLinks || [])}
                                                                                disabled={isSaving}
                                                                                className={`flex items-center justify-between p-2.5 rounded-lg border transition-all text-left ${isLinked ? 'bg-indigo-50 border-indigo-200 text-indigo-900' : 'bg-white border-slate-100 text-slate-600 hover:border-slate-200'}`}
                                                                            >
                                                                                <div className="flex items-center gap-2 min-w-0">
                                                                                    {isSaving ? (
                                                                                        <Loader2 size={14} className="animate-spin text-indigo-500" />
                                                                                    ) : isLinked ? (
                                                                                        <CheckSquare size={14} className="text-indigo-600 flex-shrink-0" />
                                                                                    ) : (
                                                                                        <Square size={14} className="text-slate-300 flex-shrink-0" />
                                                                                    )}
                                                                                    <span className="text-[11px] font-medium truncate">{node.name}</span>
                                                                                </div>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
      ) : (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                        <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <List size={18} className="text-indigo-500" />
                            Resumen de Vínculos REU
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">Vista rápida de todos los componentes REU y sus microprocesos vinculados.</p>
                    </div>
                    <div className="relative w-full md:w-80">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Buscar por nombre de REU..." 
                            value={viewSearchTerm}
                            onChange={(e) => setViewSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                    {reuMicroprocesses
                        .filter(reu => !viewSearchTerm || reu.name.toLowerCase().includes(viewSearchTerm.toLowerCase()))
                        .map(reu => {
                            const usages = reuUsageMap[reu.id] || [];
                            return (
                                <div key={reu.id} className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                    <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
                                        <div>
                                            <h4 className="font-bold text-slate-900 flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                                {reu.name}
                                            </h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{reu.macro}</span>
                                                <span className="text-slate-300">•</span>
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{reu.process}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${usages.length > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}>
                                                {usages.length} VÍNCULOS
                                            </span>
                                            <button 
                                                onClick={() => {
                                                    setSelectedReuId(reu.id);
                                                    setActiveTab('LINK');
                                                }}
                                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all shadow-sm border border-transparent hover:border-slate-100"
                                                title="Editar Vínculos"
                                            >
                                                <ExternalLink size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        {usages.length === 0 ? (
                                            <p className="text-xs text-slate-400 italic text-center py-4">Este componente no está vinculado a ningún microproceso.</p>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-3">
                                                {usages.map(usage => (
                                                    <div key={usage.id} className="flex flex-col p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                                                        <div className="flex items-start gap-3 mb-3">
                                                            <div className="mt-0.5">
                                                                <FileText size={14} className="text-slate-300" />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-xs font-bold text-slate-700 truncate">{usage.name}</p>
                                                                <div className="flex items-center gap-1 mt-0.5">
                                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{usage.proj}</span>
                                                                    <span className="text-slate-200">/</span>
                                                                    <span className="text-[9px] font-medium text-slate-400 truncate">{usage.macro}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        
                                                        {/* Estados de los documentos */}
                                                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
                                                            {['AS IS', 'FCE', 'PM', 'TO BE'].map(type => {
                                                                const key = `${normalizeHeader(usage.proj)}|${normalizeHeader(usage.name)}|${normalizeHeader(type)}`;
                                                                const doc = docMap[key];
                                                                const state = doc?.state || DocState.NOT_STARTED;
                                                                const config = STATE_CONFIG[state];
                                                                
                                                                return (
                                                                    <div key={type} className="flex flex-col gap-1">
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-[8px] font-black text-slate-400">{type}</span>
                                                                            {doc && (
                                                                                <span className="text-[8px] font-mono text-slate-400">{config.progress}%</span>
                                                                            )}
                                                                        </div>
                                                                        <div className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold truncate ${config.color}`}>
                                                                            {config.label.split('(')[0]}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default AdminReuseMatrix;
