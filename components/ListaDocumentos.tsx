import React, { useEffect, useState } from 'react';
// IMPORTANTE: Asegúrate que esta ruta sea correcta para tu archivo de llaves
import { db } from '../firebaseConfig'; 

// Importa las funciones de Firestore para la lectura
import { collection, getDocs } from 'firebase/firestore';

function ListaDocumentos() {
  const [documentos, setDocumentos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const obtenerDocumentos = async () => {
      try {
        // 1. Referencia a la colección 'documentos'
        const documentosCollection = collection(db, 'documentos');
        
        // 2. Ejecuta la lectura de la base de datos
        const snapshot = await getDocs(documentosCollection);
        
        // 3. Mapea los resultados en un array de objetos
        const documentosList = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        }));
        
        setDocumentos(documentosList);
        
      } catch (err) {
        console.error("Error al conectar con Firestore:", err);
        setError("Error de conexión. Revisa si las claves en firebaseConfig.js son correctas.");
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
          {documentos.map(doc => (
            <li key={doc.id}>
              {/* Muestra los campos que creaste manualmente */}
              <strong>{doc.nombre}</strong> (Estado: {doc.estado}, Versión: {doc.version})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ListaDocumentos;