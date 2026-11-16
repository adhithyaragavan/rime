import heroImg from "../assets/hero.png";
import { AGENT_ADDRESS } from "../lib/config.ts";
import { ExplorerLink } from "./ui/ExplorerLink.tsx";

export function Hero() {
  return (
    <header className="hero">
      <img
        className="hero-img"
        src={heroImg}
        alt="Two stacked layers, connected by dashed alignment lines, that must line up"
      />
      <div className="hero-copy">
        <p className="hero-eyebrow">Runtime supply-chain certification</p>
        <h1>Rime</h1>
        <p className="hero-claim">
          A certificate here means <em>this scanned-clean dependency tree ran, unmodified, in a genuine
          hardware enclave, as of minutes ago</em> — not just that an enclave ran something once.
        </p>
        <p className="hero-subtitle">
          Agent <ExplorerLink kind="address" value={AGENT_ADDRESS} />
        </p>
      </div>
    </header>
  );
}
