import { Image } from "expo-image";
import React, { useMemo, useState } from "react";
import { Linking, Pressable, Text, View, type TextStyle } from "react-native";

import { mediaUrl } from "../../lib/api";
import {
  parseHtmlBlocks,
  type HtmlAlign,
  type HtmlBlock,
  type HtmlRun,
  type HtmlSpacing,
  type HtmlTextStyle,
} from "../../lib/htmlBlocks";

// An email is designed on white, so its body is always drawn on a light page
// (as the web's preview box is) — in dark mode too — and its own text colours
// stay readable.
const BODY_COLOR = "#374151";
const LINK_COLOR = "#2563EB";

const BLOCK_TEXT: Record<HtmlTextStyle, TextStyle> = {
  p: { fontSize: 14, lineHeight: 22 },
  li: { fontSize: 14, lineHeight: 22 },
  quote: { fontSize: 14, lineHeight: 22, fontStyle: "italic", color: "#4B5563" },
  h1: { fontSize: 22, lineHeight: 30 },
  h2: { fontSize: 18, lineHeight: 26 },
  h3: { fontSize: 16, lineHeight: 24 },
};

/** Vertical margin per block kind (lib/htmlBlocks `HtmlSpacing`). */
const SPACING: Record<HtmlSpacing, number> = { none: 0, list: 4, paragraph: 14 };

const isHeading = (style: HtmlTextStyle) => style === "h1" || style === "h2" || style === "h3";

const ALIGN_ITEMS: Record<HtmlAlign, "flex-start" | "center" | "flex-end"> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

/** Opens only web, mail and phone links — never an arbitrary scheme from a template. */
function openLink(href: string) {
  if (!/^(https?:|mailto:|tel:)/i.test(href)) return;
  Linking.openURL(href).catch(() => {});
}

function runStyle(run: HtmlRun, heading: boolean): TextStyle {
  const lines = [run.underline || run.href ? "underline" : null, run.strike ? "line-through" : null]
    .filter(Boolean)
    .join(" ") as TextStyle["textDecorationLine"];
  return {
    // Every run states its weight: the app's font wrapper picks the Montserrat file
    // from each Text's own weight, so a run without one would drop a heading's bold.
    fontWeight: run.bold || heading ? "700" : "400",
    ...(run.italic ? { fontStyle: "italic" as const } : {}),
    ...(lines ? { textDecorationLine: lines } : {}),
    ...(run.href ? { color: LINK_COLOR } : run.color ? { color: run.color } : {}),
    ...(run.highlight ? { backgroundColor: run.highlight } : {}),
  };
}

function TextBlock({ block }: { block: Extract<HtmlBlock, { kind: "text" }> }) {
  const heading = isHeading(block.style);
  const text = (
    <Text
      style={[
        { color: BODY_COLOR, textAlign: block.align ?? "left" },
        BLOCK_TEXT[block.style],
        block.marker ? { flex: 1 } : null,
      ]}
    >
      {block.runs.map((run, i) => (
        <Text
          key={i}
          style={runStyle(run, heading)}
          onPress={run.href ? () => openLink(run.href!) : undefined}
          suppressHighlighting
        >
          {run.text}
        </Text>
      ))}
    </Text>
  );

  if (block.style === "quote") {
    return (
      <View style={{ borderLeftWidth: 3, borderLeftColor: "#D1D5DB", paddingLeft: 12 }}>{text}</View>
    );
  }
  if (block.marker) {
    return (
      <View style={{ flexDirection: "row", paddingLeft: 4 }}>
        <Text style={[{ color: BODY_COLOR, width: 22 }, BLOCK_TEXT.li]}>{block.marker}</Text>
        {text}
      </View>
    );
  }
  return text;
}

function ImageBlock({
  block,
  bodyWidth,
}: {
  block: Extract<HtmlBlock, { kind: "image" }>;
  bodyWidth: number;
}) {
  const uri = mediaUrl(block.src);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  if (!uri) return null;

  // Same sizing as the web preview: an explicit width wins, otherwise the image's
  // own width — and never wider than the body (max-width: 100%).
  const wanted = block.widthFraction
    ? bodyWidth * block.widthFraction
    : block.widthPx ?? natural?.width ?? bodyWidth;
  const width = Math.min(wanted, bodyWidth);
  const height = natural ? (width * natural.height) / natural.width : width * 0.5;

  const image = (
    <Image
      source={{ uri }}
      style={{ width, height }}
      contentFit="contain"
      transition={150}
      accessibilityLabel={block.alt || undefined}
      onLoad={(e) => {
        const { width: w, height: h } = e.source;
        if (w > 0 && h > 0) setNatural({ width: w, height: h });
      }}
    />
  );

  return (
    <View style={{ alignItems: ALIGN_ITEMS[block.align ?? "left"] }}>
      {block.href ? (
        <Pressable onPress={() => openLink(block.href!)} accessibilityRole="link">
          {image}
        </Pressable>
      ) : (
        image
      )}
    </View>
  );
}

/**
 * Renders an HTML email body (a template, campaign or notification) the way the
 * web's preview shows it: images in place, paragraphs, headings, lists, links and
 * inline formatting. See `lib/htmlBlocks` for what is understood.
 */
export function HtmlBody({ html, emptyText = "No body content" }: { html: string; emptyText?: string }) {
  const blocks = useMemo(() => parseHtmlBlocks(html), [html]);
  const [bodyWidth, setBodyWidth] = useState(0);

  if (blocks.length === 0) {
    return <Text style={{ fontSize: 14, fontStyle: "italic", color: "#9CA3AF" }}>{emptyText}</Text>;
  }

  return (
    <View onLayout={(e) => setBodyWidth(Math.floor(e.nativeEvent.layout.width))}>
      {blocks.map((block, i) => {
        // Neighbouring margins collapse to the larger one, as in the web preview.
        const marginTop =
          i === 0 ? 0 : Math.max(SPACING[blocks[i - 1].spacing], SPACING[block.spacing]);
        let content: React.ReactNode;
        switch (block.kind) {
          case "text":
            content = <TextBlock block={block} />;
            break;
          case "image":
            // Images are sized against the body, so wait until it has been measured.
            content = bodyWidth > 0 ? <ImageBlock block={block} bodyWidth={bodyWidth} /> : null;
            break;
          case "rule":
            content = <View style={{ height: 1, backgroundColor: "#E5E7EB" }} />;
            break;
          case "spacer":
            // an empty line is one line of text tall
            content = <View style={{ height: BLOCK_TEXT.p.lineHeight }} />;
            break;
        }
        return (
          <View key={i} style={{ marginTop }}>
            {content}
          </View>
        );
      })}
    </View>
  );
}
