import express from 'express';
import path from 'path';
import multer from 'multer';
import * as pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

// Configure body parser and multer memory storage
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max file size
});

// Response JSON schema for process extraction via Gemini
const processExtractionSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    description: { type: Type.STRING },
    version: { type: Type.STRING },
    asIsContext: { type: Type.STRING },
    toBeOptimizations: { type: Type.STRING },
    fceFactors: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    glossary: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          definition: { type: Type.STRING }
        },
        required: ["term", "definition"]
      }
    },
    stages: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          number: { type: Type.INTEGER },
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          responsibleRole: { type: Type.STRING },
          substeps: { type: Type.ARRAY, items: { type: Type.STRING } },
          criticalControlPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
          estimatedTimeMinutes: { type: Type.INTEGER },
          failureImpact: { type: Type.STRING }
        },
        required: ["number", "name", "description", "responsibleRole", "substeps", "criticalControlPoints", "estimatedTimeMinutes", "failureImpact"]
      }
    },
    subprocesses: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          code: { type: Type.STRING },
          name: { type: Type.STRING },
          activities: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["code", "name", "activities"]
      }
    },
    sipocRows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          supplier: { type: Type.STRING },
          input: { type: Type.STRING },
          processName: { type: Type.STRING },
          output: { type: Type.STRING },
          customer: { type: Type.STRING }
        },
        required: ["supplier", "input", "processName", "output", "customer"]
      }
    },
    governanceRules: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          code: { type: Type.STRING },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          severity: { type: Type.STRING },
          enforcementType: { type: Type.STRING }
        },
        required: ["code", "title", "description", "severity", "enforcementType"]
      }
    },
    roles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          responsibilities: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["name", "responsibilities"]
      }
    },
    integrations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          systemName: { type: Type.STRING },
          protocol: { type: Type.STRING },
          endpoint: { type: Type.STRING },
          authentication: { type: Type.STRING }
        },
        required: ["systemName", "protocol", "endpoint", "authentication"]
      }
    }
  },
  required: ["name", "description", "version", "stages", "governanceRules", "roles", "integrations"]
};

// Response JSON schema for Word document process extraction (/api/parse-word)
const wordParseSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    meta: {
      type: Type.OBJECT,
      properties: {
        code: { type: Type.STRING },
        name: { type: Type.STRING },
        version: { type: Type.STRING },
        owner: { type: Type.STRING },
        type: { type: Type.STRING }
      },
      required: ["code", "name", "version", "owner", "type"]
    },
    purpose: { type: Type.STRING },
    scope: { type: Type.STRING },
    kpis: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          metric: { type: Type.STRING },
          target: { type: Type.STRING },
          frequency: { type: Type.STRING }
        },
        required: ["name", "metric", "target", "frequency"]
      }
    },
    sipoc: {
      type: Type.OBJECT,
      properties: {
        suppliers: { type: Type.ARRAY, items: { type: Type.STRING } },
        inputs: { type: Type.ARRAY, items: { type: Type.STRING } },
        processName: { type: Type.STRING },
        outputs: { type: Type.ARRAY, items: { type: Type.STRING } },
        customers: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["suppliers", "inputs", "processName", "outputs", "customers"]
    },
    roles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          responsibility: { type: Type.STRING }
        },
        required: ["id", "title", "responsibility"]
      }
    },
    steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          roleId: { type: Type.STRING },
          description: { type: Type.STRING },
          inputs: { type: Type.ARRAY, items: { type: Type.STRING } },
          outputs: { type: Type.ARRAY, items: { type: Type.STRING } },
          duration: { type: Type.STRING },
          rules: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["id", "name", "roleId", "description", "inputs", "outputs", "duration", "rules"]
      }
    },
    businessRules: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          description: { type: Type.STRING },
          type: { type: Type.STRING }
        },
        required: ["id", "description", "type"]
      }
    }
  },
  required: ["id", "meta", "purpose", "scope", "kpis", "sipoc", "roles", "steps", "businessRules"]
};

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Endpoint: Word (.docx) Document Parsing with Gemini
app.post('/api/parse-word', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se adjuntó ningún archivo Word (.docx).' });
    }

    // Extract raw text using mammoth
    const docxResult = await mammoth.extractRawText({ buffer: req.file.buffer });
    const rawText = docxResult.value || '';

    if (!rawText.trim()) {
      return res.status(400).json({ error: 'No se pudo extraer texto legible del documento Word.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'No se encontró la clave GEMINI_API_KEY en las variables de entorno del servidor. Configure GEMINI_API_KEY.'
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `Eres un Ingeniero Principal de Procesos y Experto en Gestión Operativa e Institucional.
Tu objetivo es analizar minuciosamente el documento Word (.docx) provisto y estructurar la Ficha de Caracterización de Proceso (FCE) y la Matriz de Actividades TO BE.
Debes retornar estrictamente el esquema JSON indicado con las siguientes especificaciones:
1. "id": slug del proceso en minúsculas (ej: "proc_mantenimiento_preventivo").
2. "meta": { "code": "Código del proceso", "name": "Nombre oficial", "version": "Versión ej 1.0", "owner": "Cargo del dueño/responsable", "type": "Estratégico / Operativo / Apoyo" }.
3. "purpose": Objetivo formal del proceso.
4. "scope": Alcance (límites de inicio y fin).
5. "kpis": Array de { "name", "metric", "target", "frequency" }.
6. "sipoc": { "suppliers": [], "inputs": [], "processName": "Nombre del Proceso", "outputs": [], "customers": [] }.
7. "roles": Array de { "id", "title", "responsibility" }.
8. "steps": Array de pasos ordenados TO BE con { "id", "name", "roleId" (debe coincidir con id de roles), "description", "inputs": [], "outputs": [], "duration", "rules": [] }.
9. "businessRules": Array de { "id", "description", "type" ("Bloqueante", "Advertencia", "Informativo") }.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${systemInstruction}\n\nContenido extraído del documento Word:\n${rawText}` }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: wordParseSchema,
        temperature: 0.1
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('Gemini no devolvió ninguna respuesta para el documento Word.');
    }

    const parsedData = JSON.parse(responseText);

    return res.json({
      success: true,
      data: parsedData
    });
  } catch (err: any) {
    console.error('Error in /api/parse-word:', err);
    return res.status(500).json({
      error: 'Error al procesar el documento Word con IA: ' + (err.message || String(err))
    });
  }
});

// Endpoint: AI Process Extraction from Document or Prompt
app.post('/api/extract-process-from-doc', upload.single('file'), async (req, res) => {
  try {
    const promptText = (req.body.promptText || '').toString().trim();
    let fileText = (req.body.fileText || '').toString().trim();

    // Extract text from uploaded file if provided
    if (req.file) {
      const filename = (req.file.originalname || '').toLowerCase();
      const mime = req.file.mimetype || '';

      if (filename.endsWith('.pdf') || mime === 'application/pdf') {
        try {
          const parsePdf = (pdfParse as any).default || pdfParse;
          const pdfData = await parsePdf(req.file.buffer);
          if (pdfData && pdfData.text) {
            fileText = pdfData.text;
          }
        } catch (pdfErr) {
          console.error('[ExtractDoc] Error parsing PDF file:', pdfErr);
        }
      } else if (filename.endsWith('.docx') || filename.endsWith('.doc')) {
        try {
          const docxRes = await mammoth.extractRawText({ buffer: req.file.buffer });
          if (docxRes && docxRes.value) {
            fileText = docxRes.value;
          }
        } catch (docxErr) {
          console.error('[ExtractDoc] Error parsing Word document:', docxErr);
        }
      } else if (
        filename.endsWith('.txt') ||
        filename.endsWith('.csv') ||
        filename.endsWith('.json') ||
        filename.endsWith('.md') ||
        filename.endsWith('.xml') ||
        filename.endsWith('.html') ||
        mime.startsWith('text/')
      ) {
        fileText = req.file.buffer.toString('utf-8');
      }
    }

    const combinedInput = [
      promptText ? `Instrucciones / Contexto del usuario:\n${promptText}` : '',
      fileText ? `Contenido extraído del documento original:\n${fileText}` : ''
    ].filter(Boolean).join('\n\n---\n\n');

    if (!combinedInput && !req.file) {
      return res.status(400).json({
        error: 'Debe ingresar un texto o adjuntar un archivo para extraer la estructura del proceso normativo.'
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'No se encontró la clave GEMINI_API_KEY en las variables de entorno del servidor. Por favor configure GEMINI_API_KEY.'
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `Eres un Ingeniero Principal de Procesos y Gestión Operativa Institucional.
Tu objetivo es analizar minuciosamente el documento o texto provisto y extraer/estructurar un Proceso Normativo Completo para UpEngine.
Debes generar una estructura detallada que contenga:
1. Nombre (name), descripción corta (description) y versión (version) del proceso.
2. Situación actual (asIsContext) y optimizaciones propuestas (toBeOptimizations).
3. Factores Críticos de Éxito (fceFactors: lista de strings).
4. Glosario de términos técnicos (glossary: lista de { term, definition }).
5. Secuencia ordenada de etapas (stages) con number, name, description, responsibleRole, substeps (actividades secundarias), criticalControlPoints (puntos críticos de control), estimatedTimeMinutes (duración estimada en minutos), y failureImpact ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW').
6. Desglose de subprocesos (subprocesses) con code (ej: "4.1"), name, y actividades ordenadas (activities: lista de strings).
7. Matriz SIPOC (sipocRows) con supplier (proveedor), input (insumo), processName (subproceso), output (entregable), customer (usuario destinatario).
8. Reglas de gobernanza normativas (governanceRules) con code único (ej: "REG-SGD-01"), title, description, severity ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW') y enforcementType ('BLOCKING', 'WARNING', 'INFO').
9. Roles organizacionales institucionales (roles) con name y responsabilidades (responsibilities: lista de strings).
10. Sistemas de integración (integrations) con systemName, protocol, endpoint y authentication.`;

    const userParts: any[] = [];

    // Attach inline data if image or PDF
    if (req.file) {
      const mime = req.file.mimetype || '';
      if (mime.startsWith('image/') || mime === 'application/pdf') {
        userParts.push({
          inlineData: {
            data: req.file.buffer.toString('base64'),
            mimeType: mime === 'application/pdf' ? 'application/pdf' : mime
          }
        });
      }
    }

    userParts.push({
      text: `${systemInstruction}\n\nDocumento / Entrada a procesar:\n${combinedInput || 'Analice el archivo adjunto.'}`
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: userParts
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: processExtractionSchema,
        temperature: 0.2
      }
    });

    const rawResponseText = response.text;
    if (!rawResponseText) {
      throw new Error('La API de Gemini no retornó contenido.');
    }

    const processData = JSON.parse(rawResponseText);
    
    // Add generated IDs if missing
    if (!processData.id) {
      const slug = (processData.name || 'proceso')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      processData.id = `proc_${slug}`;
    }

    if (!processData.lastUpdated) {
      processData.lastUpdated = new Date().toISOString().split('T')[0];
    }

    // Ensure stage IDs
    if (Array.isArray(processData.stages)) {
      processData.stages = processData.stages.map((stg: any, idx: number) => ({
        ...stg,
        id: stg.id || `stg_${idx + 1}`,
        number: stg.number || idx + 1
      }));
    }

    // Ensure governance IDs
    if (Array.isArray(processData.governanceRules)) {
      processData.governanceRules = processData.governanceRules.map((gov: any, idx: number) => ({
        ...gov,
        id: gov.id || `gov_${idx + 1}`
      }));
    }

    // Ensure role IDs
    if (Array.isArray(processData.roles)) {
      processData.roles = processData.roles.map((r: any, idx: number) => ({
        ...r,
        id: r.id || `role_${idx + 1}`
      }));
    }

    // Ensure integration IDs
    if (Array.isArray(processData.integrations)) {
      processData.integrations = processData.integrations.map((i: any, idx: number) => ({
        ...i,
        id: i.id || `int_${idx + 1}`
      }));
    }

    return res.json({
      success: true,
      process: processData
    });
  } catch (err: any) {
    console.error('Error in /api/extract-process-from-doc:', err);
    return res.status(500).json({
      error: 'Error al procesar el documento con IA: ' + (err.message || String(err))
    });
  }
});

// Vite Middleware or Production Static Handler
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[UpEngine Server] Execution environment listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
