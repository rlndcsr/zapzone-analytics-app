/**
 * Base64 QR generation for the `qr_code` field on `POST /api/payments/charge`.
 *
 * The web builds this with the `qrcode` npm package (`QRCode.toDataURL`), which
 * needs a canvas. Here the same PNG data URI comes from `react-native-qrcode-svg`'s
 * `getRef().toDataURL()` — react-native-svg serialises the SVG tree natively, so
 * the QR never has to be visible on screen (unlike a view-shot capture).
 *
 * The encoded value is only known *after* the record is created, so `generate`
 * mounts the QR on demand, waits for the ref, reads the PNG, then unmounts.
 */

import React, { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import QRCode from "react-native-qrcode-svg";

/** Matches the web's `generateQRCode` defaults (300px, margin 2). */
const QR_SIZE = 300;

/** Never let QR generation stall a checkout — the field is optional. */
const QR_TIMEOUT_MS = 4000;

type SvgHandle = { toDataURL: (callback: (data: string) => void) => void };

export type QrDataUri = {
  /** Mount this once in the screen's tree; it renders nothing visible. */
  node: React.ReactElement | null;
  /**
   * PNG data URI for `value`, or `null` if generation failed or timed out.
   * Never throws — a missing QR must not abort a successful charge.
   */
  generate: (value: string) => Promise<string | null>;
};

export function useQrDataUri(): QrDataUri {
  const [value, setValue] = useState<string | null>(null);
  const svgRef = useRef<SvgHandle | null>(null);
  // Resolved by `handleRef` once the freshly mounted QR reports its SVG handle.
  const readyRef = useRef<(() => void) | null>(null);

  const handleRef = useCallback((instance: SvgHandle | null) => {
    svgRef.current = instance;
    if (instance && readyRef.current) {
      readyRef.current();
      readyRef.current = null;
    }
  }, []);

  const generate = useCallback(async (next: string): Promise<string | null> => {
    try {
      const mounted = new Promise<void>((resolve) => {
        readyRef.current = resolve;
      });
      setValue(next);

      const timeout = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), QR_TIMEOUT_MS),
      );
      if ((await Promise.race([mounted, timeout])) === "timeout") return null;

      const handle = svgRef.current;
      if (!handle) return null;

      const base64 = await Promise.race([
        new Promise<string | null>((resolve) => {
          handle.toDataURL((data) => resolve(data ?? null));
        }),
        timeout.then(() => null),
      ]);
      return base64 ? `data:image/png;base64,${base64}` : null;
    } catch {
      return null;
    } finally {
      readyRef.current = null;
      setValue(null);
    }
  }, []);

  const node = value ? (
    // Off-screen and non-interactive: only the SVG tree is needed, not pixels.
    <View
      pointerEvents="none"
      collapsable={false}
      style={{ position: "absolute", left: -10000, top: -10000, opacity: 0 }}
    >
      <QRCode
        value={value}
        size={QR_SIZE}
        quietZone={8}
        backgroundColor="#FFFFFF"
        color="#000000"
        getRef={handleRef}
      />
    </View>
  ) : null;

  return { node, generate };
}

/** QR payload for an attraction ticket (web `generatePurchaseQRData`). */
export const attractionPurchaseQrValue = (purchaseId: number): string =>
  JSON.stringify({ type: "attraction_purchase", id: purchaseId });

/**
 * QR payload for a multi-item ticket order (web `generateOrderQRData`). One code
 * admits the whole order, so check-in scans this instead of each line.
 */
export const ticketOrderQrValue = (orderId: number): string =>
  JSON.stringify({ type: "ticket_order", id: orderId });
