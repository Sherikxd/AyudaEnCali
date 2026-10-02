import React from 'react';
import type { FaqBlock, FaqItem, FaqSpan } from '../data/faq';

/**
 * Renderiza un fragmento del FAQ con su marca (negrita, cursiva, monoespaciada).
 * `key` es la posición: los datos son una lista plana, no cambian de orden.
 */
const renderSpan = (span: FaqSpan, key: number): React.ReactNode => {
  if (span.mark === 'strong') return <strong key={key}>{span.text}</strong>;
  if (span.mark === 'em') return <em key={key}>{span.text}</em>;
  if (span.mark === 'code')
    return (
      <code key={key} className="font-mono text-[11px]">
        {span.text}
      </code>
    );
  return <React.Fragment key={key}>{span.text}</React.Fragment>;
};

const renderSpans = (spans: readonly FaqSpan[]): React.ReactNode =>
  spans.map((span, index) => renderSpan(span, index));

/** Primer bloque sin margen superior; el resto, `mt-2` (mismo marcado que el modal original). */
const renderBlock = (block: FaqBlock, index: number, key: number): React.ReactNode => {
  if (block.kind === 'p') {
    return (
      <p key={key} className={index === 0 ? undefined : 'mt-2'}>
        {renderSpans(block.spans)}
      </p>
    );
  }
  const listClass =
    index === 0
      ? 'space-y-1.5 list-disc list-inside marker:text-orange-500'
      : 'mt-2 space-y-1.5 list-disc list-inside marker:text-orange-500';
  return (
    <ul key={key} className={listClass}>
      {block.items.map((item, itemIndex) => (
        <li key={itemIndex}>{renderSpans(item)}</li>
      ))}
    </ul>
  );
};

/**
 * Respuesta completa de una pregunta, a partir de los bloques tipados de
 * `src/data/faq.ts`. La página independiente y el JSON-LD de `index.html`
 * consumen la misma fuente de preguntas y respuestas.
 */
export const FaqAnswer: React.FC<{ item: FaqItem }> = ({ item }) => (
  <>
    {item.blocks.map((block, index) => renderBlock(block, index, index))}
  </>
);
