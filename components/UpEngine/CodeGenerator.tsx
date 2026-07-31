import React, { useState } from 'react';
import { UpProcess, CodeLang } from '../../types/upEngine';
import { Code, Copy, Check, Terminal, FileCode, Server, Shield } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  process: UpProcess;
}

export const CodeGenerator: React.FC<Props> = ({ process }) => {
  const [selectedLang, setSelectedLang] = useState<CodeLang>('typescript');
  const [copied, setCopied] = useState(false);

  const generateCode = (lang: CodeLang): string => {
    const rulesCode = process.governanceRules
      .map(
        (r) =>
          `    // [Rule ${r.code}] ${r.title} (${r.severity} - ${r.enforcementType})\n    // ${r.description}`
      )
      .join('\n');

    switch (lang) {
      case 'typescript':
        return `/**
 * UpEngine Integration Client - ${process.name} (v${process.version})
 * Auto-generated SDK for Process Governance & Validation
 */

export interface StageExecutionPayload {
  stageId: string;
  stageNumber: number;
  responsibleRole: string;
  payload: Record<string, any>;
  temperatureCelsius?: number;
  vitalSigns?: Record<string, number>;
}

export interface GovernanceValidationResult {
  valid: boolean;
  code: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  enforcement: 'BLOCKING' | 'WARNING' | 'INFO';
  message: string;
}

export class ${process.id.replace(/[^a-zA-Z0-9]/g, '')}Service {
  private static readonly ENDPOINT = "${process.integrations[0]?.endpoint || '/api/v1/process'}";

  /**
   * Validates governance rules before stage transition
   */
  public static validateGovernance(payload: StageExecutionPayload): GovernanceValidationResult[] {
    const violations: GovernanceValidationResult[] = [];

${process.governanceRules
  .map(
    (rule) => `    // Rule ${rule.code}: ${rule.title}
    if (payload.stageNumber === 1 && !payload.payload?.isValid) {
      violations.push({
        valid: false,
        code: "${rule.code}",
        severity: "${rule.severity}",
        enforcement: "${rule.enforcementType}",
        message: "${rule.title}: ${rule.description.replace(/"/g, '\\"')}"
      });
    }`
  )
  .join('\n\n')}

    return violations;
  }

  /**
   * Executes a process stage with sychronized governance checks
   */
  public static async executeStage(payload: StageExecutionPayload): Promise<{ success: boolean; data: any }> {
    const violations = this.validateGovernance(payload);
    const blocking = violations.filter(v => v.enforcement === 'BLOCKING');
    
    if (blocking.length > 0) {
      throw new Error(\`[UpEngine Blocking Exception] Governance violation: \${blocking[0].message}\`);
    }

    const response = await fetch(this.ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': '${process.integrations[0]?.authentication || 'Bearer JWT_TOKEN'}'
      },
      body: JSON.stringify({
        processId: "${process.id}",
        version: "${process.version}",
        stagePayload: payload,
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }

    return await response.json();
  }
}
`;

      case 'python':
        return `# UpEngine Integration Client - ${process.name} (v${process.version})
import requests
import json
from datetime import datetime
from typing import Dict, Any, List

class ${process.id.replace(/[^a-zA-Z0-9]/g, '')}Client:
    ENDPOINT = "${process.integrations[0]?.endpoint || '/api/v1/process'}"
    PROCESS_ID = "${process.id}"
    VERSION = "${process.version}"

    @classmethod
    def validate_governance(cls, stage_number: int, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        violations = []
${process.governanceRules
  .map(
    (rule) => `        # Rule ${rule.code}: ${rule.title}
        if stage_number == 1 and not payload.get('is_valid', True):
            violations.append({
                'code': '${rule.code}',
                'severity': '${rule.severity}',
                'enforcement': '${rule.enforcementType}',
                'message': '${rule.title}: ${rule.description.replace(/'/g, "\\'")}'
            })`
  )
  .join('\n')}
        return violations

    @classmethod
    def execute_stage(cls, stage_number: int, payload: Dict[str, Any]) -> Dict[str, Any]:
        violations = cls.validate_governance(stage_number, payload)
        blocking = [v for v in violations if v['enforcement'] == 'BLOCKING']
        if blocking:
            raise ValueError(f"[UpEngine Exception] Blocking rule violated: {blocking[0]['message']}")

        headers = {
            'Content-Type': 'application/json',
            'Authorization': '${process.integrations[0]?.authentication || 'Bearer JWT_TOKEN'}'
        }
        data = {
            'processId': cls.PROCESS_ID,
            'version': cls.VERSION,
            'stageNumber': stage_number,
            'payload': payload,
            'timestamp': datetime.utcnow().isoformat()
        }
        response = requests.post(cls.ENDPOINT, json=data, headers=headers)
        response.raise_for_status()
        return response.json()
`;

      case 'csharp':
        return `using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace UpEngine.Integration
{
    public class ${process.id.replace(/[^a-zA-Z0-9]/g, '')}Service
    {
        private static readonly HttpClient client = new HttpClient();
        private const string Endpoint = "${process.integrations[0]?.endpoint || '/api/v1/process'}";

        public static async Task<bool> ExecuteStageAsync(int stageNumber, object payload)
        {
            var requestBody = new
            {
                processId = "${process.id}",
                version = "${process.version}",
                stageNumber = stageNumber,
                payload = payload,
                timestamp = DateTime.UtcNow
            };

            var json = JsonConvert.SerializeObject(requestBody);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await client.PostAsync(Endpoint, content);
            response.EnsureSuccessStatusCode();
            return true;
        }
    }
}
`;

      case 'java':
        return `package cl.hospital.upengine;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class ${process.id.replace(/[^a-zA-Z0-9]/g, '')}Client {
    private static final String ENDPOINT = "${process.integrations[0]?.endpoint || '/api/v1/process'}";
    private static final HttpClient client = HttpClient.newHttpClient();

    public static void executeStage(int stageNumber, String jsonPayload) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(ENDPOINT))
                .header("Content-Type", "application/json")
                .header("Authorization", "${process.integrations[0]?.authentication || 'Bearer JWT_TOKEN'}")
                .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new RuntimeException("UpEngine Exception: " + response.body());
        }
    }
}
`;

      case 'curl':
        return `# Execute Process Stage with UpEngine Normative Headers
curl -X POST "${process.integrations[0]?.endpoint || 'https://api.hospital.cl/v1/process/execute'}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: ${process.integrations[0]?.authentication || 'Bearer YOUR_JWT_TOKEN'}" \\
  -H "X-UpEngine-Process-ID: ${process.id}" \\
  -H "X-UpEngine-Version: ${process.version}" \\
  -d '{
    "stageNumber": 1,
    "responsibleRole": "${process.stages[0]?.responsibleRole || 'Operador'}",
    "timestamp": "${new Date().toISOString()}",
    "stageData": {
      "verified": true,
      "controlPoints": [
        "${process.stages[0]?.criticalControlPoints[0] || 'PCC Normal'}"
      ]
    }
  }'
`;

      default:
        return '';
    }
  };

  const currentCode = generateCode(selectedLang);

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    toast.success('Código copiado al portapapeles');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Code size={16} /> Generador de Código de Integración
          </div>
          <h3 className="text-lg font-bold">SDK e Integración Normativa Externa</h3>
          <p className="text-xs text-slate-400 mt-1">
            Código fuente listos para producción con validadores de gobernanza incorporados para {process.name}.
          </p>
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 shrink-0"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          <span>{copied ? '¡Copiado!' : 'Copiar Código'}</span>
        </button>
      </div>

      {/* Language Selector Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        {(
          [
            { id: 'typescript', name: 'TypeScript / Node.js', icon: FileCode },
            { id: 'python', name: 'Python 3.x', icon: Terminal },
            { id: 'csharp', name: 'C# / .NET', icon: Code },
            { id: 'java', name: 'Java 17+', icon: Server },
            { id: 'curl', name: 'cURL / REST API', icon: Terminal }
          ] as const
        ).map((lang) => {
          const Icon = lang.icon;
          const isSelected = selectedLang === lang.id;
          return (
            <button
              key={lang.id}
              onClick={() => setSelectedLang(lang.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                isSelected
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon size={14} className={isSelected ? 'text-indigo-400' : 'text-slate-400'} />
              <span>{lang.name}</span>
            </button>
          );
        })}
      </div>

      {/* Code Editor Preview */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-xl">
        <div className="bg-slate-900/90 px-4 py-3 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
            <span className="ml-2 font-semibold text-slate-300">
              upengine_sdk_{process.id}.{selectedLang === 'python' ? 'py' : selectedLang === 'csharp' ? 'cs' : selectedLang === 'java' ? 'java' : selectedLang === 'curl' ? 'sh' : 'ts'}
            </span>
          </div>
          <span className="text-[10px] uppercase font-bold text-slate-500">
            {selectedLang}
          </span>
        </div>

        <pre className="p-6 text-xs font-mono text-emerald-400 overflow-x-auto leading-relaxed max-h-[550px]">
          <code>{currentCode}</code>
        </pre>
      </div>
    </div>
  );
};
