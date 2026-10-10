import type { CSSProperties } from "react";
import logo from "../assets/logo.png";

export default function BrandMark({ style }: { style: CSSProperties }) {
  return (
    <div style={style} className="flex items-center gap-3">
      <img src={logo} alt="" className="size-12" />
    </div>
  );
}
