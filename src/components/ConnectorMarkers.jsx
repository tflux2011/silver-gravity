// Reusable SVG <marker> definitions for UML connector arrowheads.
//
// Rendered once inside the connector overlay's <defs>. Kept as a component so
// every diagram surface (canvas + future export) shares identical geometry.
export default function ConnectorMarkers() {
  return (
    <defs>
      {/* Open arrow for associations - soft slate on light canvas */}
      <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9" fill="none" stroke="#9aa2af" strokeWidth="1.5" />
      </marker>

      {/* Hollow triangle for inheritance / generalization / realization */}
      <marker id="inheritance" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 Z" fill="#ffffff" stroke="#9aa2af" strokeWidth="1.5" />
      </marker>

      {/* Filled diamond for composition */}
      <marker id="composition" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 0 5 L 5 10 L 10 5 L 5 0 Z" fill="#9aa2af" />
      </marker>

      {/* Hollow diamond for aggregation */}
      <marker id="aggregation" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 0 5 L 5 10 L 10 5 L 5 0 Z" fill="#ffffff" stroke="#9aa2af" strokeWidth="1.5" />
      </marker>
    </defs>
  );
}
