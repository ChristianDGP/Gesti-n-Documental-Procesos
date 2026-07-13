const fs = require('fs');
const content = fs.readFileSync('views/Reports.tsx', 'utf8');
const lines = content.split('\n');

let start = -1;
let end = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('{/* Gráfico de Barras por Macroproceso */}')) {
        start = i;
    }
    if (start !== -1 && lines[i].includes('{/* Tabla Drill-down */}')) {
        end = i - 1;
        break;
    }
}

const replacement = `                                    {/* Gráfico de Barras por Macroproceso */}
                                    <div className="p-6 border-b border-slate-100 bg-slate-50/30">
                                        <h5 className="text-xs font-bold text-slate-700 mb-4 uppercase tracking-wider">Documentos Terminados por Macroproceso</h5>
                                        {macroprocessThreeDrillDownStats.length === 0 ? (
                                            <p className="text-xs text-slate-400 italic">No hay datos disponibles.</p>
                                        ) : (
                                            <div className="h-[300px] w-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart
                                                        data={macroprocessThreeDrillDownStats.map(macro => {
                                                            const asis = macro.docTypes['AS IS'].approved;
                                                            const fce = macro.docTypes['FCE'].approved;
                                                            const pm = macro.docTypes['PM'].approved;
                                                            const tobe = macro.docTypes['TO BE'].approved;
                                                            return { 
                                                                name: macro.macroName, 
                                                                'AS IS': asis,
                                                                'FCE': fce,
                                                                'PM': pm,
                                                                'TO BE': tobe,
                                                                total: asis + fce + pm + tobe 
                                                            };
                                                        })}
                                                        margin={{ top: 20, right: 30, left: 0, bottom: 40 }}
                                                    >
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                        <XAxis 
                                                            dataKey="name" 
                                                            axisLine={false} 
                                                            tickLine={false} 
                                                            tick={{ fontSize: 10, fill: '#64748b' }}
                                                            angle={0}
                                                            textAnchor="middle"
                                                            interval={0}
                                                        />
                                                        <YAxis 
                                                            axisLine={false} 
                                                            tickLine={false} 
                                                            tick={{ fontSize: 11, fill: '#64748b' }}
                                                            allowDecimals={false}
                                                        />
                                                        <Tooltip
                                                            cursor={{ fill: '#f1f5f9' }}
                                                            contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                            labelStyle={{ color: '#0f172a', fontWeight: 'bold', marginBottom: '4px' }}
                                                        />
                                                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                                                        <Bar dataKey="AS IS" stackId="a" fill="#3b82f6" maxBarSize={50}>
                                                            <LabelList dataKey="AS IS" position="center" fill="#ffffff" style={{ fontSize: "10px", fontWeight: "bold" }} formatter={(val) => val > 0 ? val : ''} />
                                                        </Bar>
                                                        <Bar dataKey="FCE" stackId="a" fill="#ef4444" maxBarSize={50}>
                                                            <LabelList dataKey="FCE" position="center" fill="#ffffff" style={{ fontSize: "10px", fontWeight: "bold" }} formatter={(val) => val > 0 ? val : ''} />
                                                        </Bar>
                                                        <Bar dataKey="PM" stackId="a" fill="#f59e0b" maxBarSize={50}>
                                                            <LabelList dataKey="PM" position="center" fill="#ffffff" style={{ fontSize: "10px", fontWeight: "bold" }} formatter={(val) => val > 0 ? val : ''} />
                                                        </Bar>
                                                        <Bar dataKey="TO BE" stackId="a" fill="#10b981" maxBarSize={50} radius={[4, 4, 0, 0]}>
                                                            <LabelList dataKey="TO BE" position="center" fill="#ffffff" style={{ fontSize: "10px", fontWeight: "bold" }} formatter={(val) => val > 0 ? val : ''} />
                                                            <LabelList dataKey="total" position="top" style={{ fontSize: "11px", fontWeight: "900", fill: "#475569" }} formatter={(val) => val > 0 ? val : ''} />
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}
                                    </div>`;

if (start !== -1 && end !== -1) {
    let newLines = [];
    for (let i = 0; i < lines.length; i++) {
        if (i === start) {
            newLines.push(replacement);
        } else if (i > start && i <= end) {
            // skip
        } else {
            newLines.push(lines[i]);
        }
    }
    fs.writeFileSync('views/Reports.tsx', newLines.join('\n'));
    console.log('SUCCESS');
} else {
    console.log('FAILED TO FIND BLOCK', start, end);
}
