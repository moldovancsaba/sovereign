import { Shell } from "@/components/Shell";
import { ControlRoomClient } from "./ControlRoomClient";

export default function ControlRoomPage() {
  return (
    <Shell
      title="Sovereign Control Room"
      subtitle="Governance cockpit for local DAG execution and trust boundary resolution."
    >
      <ControlRoomClient />
    </Shell>
  );
}
