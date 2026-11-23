# Publicación CASA V6

Paquete web para compartir el recorrido sin subir el archivo `.rvt` ni el JSON del modelo en texto legible.

El modelo se cifra con AES-256-GCM y una clave derivada con PBKDF2 (250.000 iteraciones). La contraseña no se guarda en los archivos. Las texturas incluidas son solo las que referencia CASA V6.

Para actualizarlo: reexportar `modelo_revit_V6.json`, ejecutar `preparar_publicacion_v6.mjs` con la variable `CASA_V6_PASSWORD` y volver a publicar esta carpeta.
