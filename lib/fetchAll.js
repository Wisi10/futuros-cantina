// PostgREST corta cada respuesta en 1000 filas (max-rows del proyecto) y
// .range no lo supera. Un mes de cantina tiene ~3000 ventas: cualquier query
// de un periodo largo tiene que paginar o devuelve solo una parte.
const PAGE = 1000;

// build: () => query de supabase SIN .range, con un .order estable.
export async function fetchAll(build) {
  let all = [];
  for (let from = 0; from < 200000; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;
  }
  return { data: all };
}
