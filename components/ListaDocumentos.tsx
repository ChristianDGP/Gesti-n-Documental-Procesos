// src/components/ListaDocumentos.tsx
import React, { useEffect, useState } from 'react';
import { db } from '../firebaseConfig'; // Importa desde el nuevo .ts
import { collection, getDocs } from 'firebase/firestore';

// ==========================================================
// CORRECCIÓN TS2345: Definición de la interfaz del documento
// ==========================================================
interface Documento {
    id: string;
    nombre: string;
    estado: string;
    version: number;
    // Agrega cualquier otro campo que hayas creado en Firestore
}

function ListaDocumentos() {
  // Tipado del estado con la interfaz Documento[]
  const [documentos, setDocumentos] = useState<Documento[]>([]); 
  const [cargando, setCargando] = useState(true);
  // Tipado del estado de error
  const [error, setError] = useState<string | null>(null); 

  useEffect(() => {
    const obtenerDocumentos = async () => {
      try {
        const documentosCollection = collection(db, 'documentos');
        const snapshot = await getDocs(documentosCollection);
        
        // Mapeamos y tipamos el resultado explícitamente
        const documentosList: Documento[] = snapshot.docs.map(doc => {
            const data = doc.data();
            return { 
                id: doc.id, 
                nombre: data.nombre || 'N/A',
                estado: data.estado || 'N/A',
                version: data.version || 0,
                // Mapea el resto de tus campos aquí
            } as Documento;
        });
        
        setDocumentos(documentosList);
        
      } catch (err) {
        console.error("Error al conectar con Firestore:", err);
        // El error es tipado como string
        setError("Error de conexión. Revisa las claves y reglas de Firebase."); 
      } finally {
        setCargando(false);
      }
    };

    obtenerDocumentos();
  }, []); 

  if (cargando) {
    return <h2>Cargando documentos desde Firestore...</h2>;
  }

  if (error) {
    return <h2 style={{ color: 'red' }}>{error}</h2>;
  }

  return (
    <div>
      <h1>✅ Conexión Exitosa: Documentos en Proceso</h1>
      {documentos.length === 0 ? (
        <p>No hay documentos cargados en la colección 'documentos' de Firestore.</p>
      ) : (
        <ul>
          {/* Los elementos ahora están tipados como Documento, resolviendo TS2339 */}
          {documentos.map(doc => (
            <li key={doc.id}>
              <strong>{doc.nombre}</strong> (Estado: {doc.estado}, Versión: {doc.version})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ListaDocumentos;