import { useCallback, useEffect, useRef, useState } from "react";

import {
  registerChangeReasonHandler,
  type ChangeReasonRequest,
} from "../../lib/changeReasonPrompt";
import { ChangeReasonModal } from "./ChangeReasonModal";

export function ChangeReasonHost() {
  const [request, setRequest] = useState<ChangeReasonRequest | null>(null);
  const resolverRef = useRef<((reason: string | null) => void) | null>(null);

  useEffect(
    () =>
      registerChangeReasonHandler(
        (next) =>
          new Promise<string | null>((resolve) => {
            resolverRef.current?.(null);
            resolverRef.current = resolve;
            setRequest(next);
          }),
      ),
    [],
  );

  const settle = useCallback((reason: string | null) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(reason);
  }, []);

  return (
    <ChangeReasonModal
      visible={request !== null}
      summary={request?.summary}
      destructive={request?.destructive}
      onCancel={() => settle(null)}
      onConfirm={(reason) => settle(reason)}
    />
  );
}

export default ChangeReasonHost;
