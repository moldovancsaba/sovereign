import Link from "next/link";

export const dynamic = "force-dynamic";

export default function SettingsAboutPage() {
  return (
    <div className="space-y-6">
      <div className="ds-card p-5">
        <div className="text-sm font-semibold">Related configuration</div>
        <div className="mt-1 text-xs text-white/60">
          Fine-tuning for models, endpoints, and workers lives with agents and products.
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Link href="/agents" className="ds-tile block">
            <div className="text-sm font-medium text-white/90">Agents & runtime</div>
            <div className="mt-1 text-xs text-white/60">
              Per-agent URL, model, API key env var, and worker controls. Use tabs: Roster, Runtime & policy, Registry & board.
            </div>
          </Link>
          <Link href="/products" className="ds-tile block">
            <div className="text-sm font-medium text-white/90">Products & projects</div>
            <div className="mt-1 text-xs text-white/60">
              Project URL, GitHub, and planning vars per product.
            </div>
          </Link>
        </div>
      </div>

      <div className="ds-card p-5">
        <div className="text-sm font-semibold">Storage and security</div>
        <div className="mt-1 text-xs text-white/60">
          Settings are stored under <span className="font-mono text-white/75">.sovereign/settings.json</span>.
          Keep secrets in <span className="font-mono text-white/75">.env</span> or{" "}
          <span className="font-mono text-white/75">.env.local</span>.
        </div>
      </div>
    </div>
  );
}
