"use client";

import {
  CARD_VIEWBOX,
  cardBackInner,
  cardInner,
  cardLabel,
  jokerInner,
  jokerLabel,
} from "@gamelobby/games-core";
import type { JokerVariant, Rank, Suit } from "@gamelobby/shared/types";
import { type CSSProperties, useId } from "react";

function useIdPrefix(): string {
  const id = useId();
  return `pc${id.replace(/[^a-zA-Z0-9]/g, "")}-`;
}

interface CardSvgProps {
  className?: string;
  style?: CSSProperties;
}

export interface PlayingCardProps extends CardSvgProps {
  suit: Suit;
  rank: Rank;
}

export function PlayingCard({
  suit,
  rank,
  className,
  style,
}: PlayingCardProps) {
  const prefix = useIdPrefix();
  return (
    <svg
      aria-label={cardLabel(suit, rank)}
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: generated card art from games-core, never user input
      dangerouslySetInnerHTML={{ __html: cardInner(suit, rank, prefix) }}
      role="img"
      style={style}
      viewBox={CARD_VIEWBOX}
    />
  );
}

export interface JokerProps extends CardSvgProps {
  variant?: JokerVariant;
}

export function Joker({ variant = "red", className, style }: JokerProps) {
  const prefix = useIdPrefix();
  return (
    <svg
      aria-label={jokerLabel(variant)}
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: generated card art from games-core, never user input
      dangerouslySetInnerHTML={{ __html: jokerInner(variant, prefix) }}
      role="img"
      style={style}
      viewBox={CARD_VIEWBOX}
    />
  );
}

export function CardBack({ className, style }: CardSvgProps) {
  const prefix = useIdPrefix();
  return (
    <svg
      aria-label="Card back"
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: generated card art from games-core, never user input
      dangerouslySetInnerHTML={{ __html: cardBackInner(prefix) }}
      role="img"
      style={style}
      viewBox={CARD_VIEWBOX}
    />
  );
}
