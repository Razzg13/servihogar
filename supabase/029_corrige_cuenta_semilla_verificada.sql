-- Detectado durante la crítica de diseño y confirmado en vivo al medir
-- "Eficiencia de desempeño" en Buscar: la cuenta de prueba "Trabajador
-- Prueba" (id 0b72e7dc-5bd7-4778-bd81-11ee0c37e69f) quedó con
-- verificado=true y aparece en los resultados reales de búsqueda con la
-- insignia "✓ Identidad verificada" — un dato falso de confianza visible
-- a cualquier cliente real.
--
-- Esto solo le quita la insignia (no borra la cuenta ni sus citas/reseñas,
-- por si el equipo todavía la usa para probar flujos).
update public.profiles
set verificado = false,
    verificacion_pendiente = false
where id = '0b72e7dc-5bd7-4778-bd81-11ee0c37e69f';

-- Alternativa más agresiva, si el equipo decide que la cuenta de prueba no
-- debería existir en absoluto en la base compartida (dejar comentado;
-- correr a mano si corresponde):
-- delete from public.profiles where id = '0b72e7dc-5bd7-4778-bd81-11ee0c37e69f';
