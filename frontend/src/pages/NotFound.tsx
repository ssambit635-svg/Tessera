import { useNavigate } from "react-router-dom";
import { TileMark } from "../components/TileMark";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="page">
      <div className="not-found">
        <TileMark size={64} className="nf-mark" />
        <span className="eyebrow">404 · missing tile</span>
        <h1 className="serif" style={{ fontSize: 48, marginTop: 8 }}>
          This piece is not part of the mosaic.
        </h1>
        <p style={{ color: "var(--text-soft)", maxWidth: "52ch", marginTop: 10 }}>
          The page you asked for does not exist. Everything scheduled is still where you left it.
        </p>
        <div className="row gap-8" style={{ marginTop: 18 }}>
          <button className="btn primary" onClick={() => navigate("/mosaic")}>
            Back to the overview
          </button>
          <button className="btn" onClick={() => navigate("/mosaic")}>
            Open the Mosaic Board
          </button>
        </div>
      </div>
    </div>
  );
}
