import { useGraphStore } from "../store/graphStore";

export function SearchBox() {
  const searchTerm = useGraphStore((state) => state.searchTerm);
  const setSearchTerm = useGraphStore((state) => state.setSearchTerm);

  return (
    <input
      className="search-input"
      value={searchTerm}
      placeholder="Search ID, name, technique"
      onChange={(event) => setSearchTerm(event.target.value)}
    />
  );
}
