const fs = require('fs');
const content = fs.readFileSync('views/Reports.tsx', 'utf8');
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('{/* Gráfico de Barras por Macroproceso */}')) {
        const replacement = `                                {/* Table 3 - Avance por Macroproceso (Drill Down) */}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
                                    <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-950">Desglose de Reportería por Macroproceso ({activeMapProject})</h4>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Avance y estados detallados de la documentación, estructurado por macroprocesos.
                                            </p>
                                        </div>
                                    </div>`;
        lines.splice(i, 0, replacement);
        break;
    }
}

fs.writeFileSync('views/Reports.tsx', lines.join('\n'));
console.log('SUCCESS');
