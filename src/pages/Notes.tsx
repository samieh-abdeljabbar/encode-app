import { Navigate, useSearchParams } from "react-router-dom";

export function Notes() {
  const [searchParams] = useSearchParams();
  const noteId = searchParams.get("id");
  const target = noteId ? `/workspace?note=${noteId}` : "/workspace";
  return <Navigate to={target} replace />;
}
