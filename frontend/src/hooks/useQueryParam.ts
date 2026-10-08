import { useSearchParams } from "react-router-dom"

/** État synchronisé avec un paramètre d'URL (?q=...), pour que la recherche globale puisse pré-remplir les pages. */
export function useQueryParam(name: string): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams()
  const value = params.get(name) ?? ""
  const set = (v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(name, v)
    else next.delete(name)
    setParams(next, { replace: true })
  }
  return [value, set]
}
