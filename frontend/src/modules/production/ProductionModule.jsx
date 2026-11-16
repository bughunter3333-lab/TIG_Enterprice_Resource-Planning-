import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { production } from '../../api';
import { notify } from '../../lib/notify';
import { useOffer } from '../../lib/useMyAccess';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';
import HandOffSheet from './HandOffSheet';
import ProductionLane from './ProductionLane';
import { cardKey, lanesWithCards } from './productionBoard';

// The floor moves on without anyone touching this screen: picking is recorded
// at the bench, work is handed on at the machines.
const REFRESH_MS = 30_000;

/**
 * The production board: who has which work, by lane — Picking, Embroidery,
 * Print, a lane per outside decorator, Packing
 * (docs/superpowers/specs/2026-11-07-production-board.md). A card is a job at
 * a lane. Tap it to hand the work on (a tablet at the machine); drag it to
 * another lane with a mouse. A hand-off records the lane and the person and
 * is written on the job's trail; it never changes the job's status.
 */
export default function ProductionModule({ onOpenJob }) {
  const queryClient = useQueryClient();
  const offer = useOffer();
  const canHandOff = offer('POST', '/production-board/hand-off');
  // The open sheet's card, by key: the card itself is re-read from each board,
  // so a refresh or a hand-off on another tablet is never acted on stale.
  const [openKey, setOpenKey] = useState(null);

  const { data: board, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['production-board'],
    queryFn: production.board,
    refetchInterval: REFRESH_MS,
  });

  // Closing gives focus back to the card that opened the sheet, or to its lane
  // when the card has moved on.
  const closeSheet = () => {
    const key = openKey;
    setOpenKey(null);
    if (!key) return;
    requestAnimationFrame(() => {
      const [, lane] = key.split('@');
      const target = document.querySelector(`[data-card-key="${CSS.escape(key)}"]`)
        ?? document.querySelector(`[data-lane="${CSS.escape(lane)}"]`);
      target?.focus();
    });
  };

  const handOff = useMutation({
    mutationFn: (handing) => production.handOff(handing),
    onSuccess: (done) => {
      notify(done.comment, { type: 'success' });
      closeSheet();
      queryClient.invalidateQueries({ queryKey: ['production-board'] });
      // The hand-off is on the job's trail now.
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (err) => {
      notify(err.message, { type: 'error' });
      // A 409: the card moved on another tablet. Close the sheet, so the stale
      // lane is never sent again, and show where the work is now.
      if (err.status === 409) closeSheet();
      queryClient.invalidateQueries({ queryKey: ['production-board'] });
    },
  });

  if (isLoading) return <p style={{ color: T.textMuted, fontSize: T.fsBase }}>Loading the board…</p>;
  // A failed refresh keeps the last good board on screen (and any open sheet):
  // a tablet on patchy wifi must not lose what the person was entering.
  if (isError && !board) {
    return (
      <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, color: T.danger, fontSize: T.fsBase }}>
        The board did not load: {error?.message}
        <Button style={{ height: 44 }} onClick={() => refetch()}>Try again</Button>
      </div>
    );
  }

  const lanes = lanesWithCards(board);
  const cards = board.cards ?? [];
  const open = openKey ? cards.find((c) => cardKey(c) === openKey) : null;
  const jobsInWork = new Set(cards.map((c) => c.job_id)).size;
  const send = (card, toLane, holder) =>
    handOff.mutate({ jobId: card.job_id, fromLane: card.lane, toLane, holder });

  // A drag hands the card to the lane alone; a person is named on the sheet.
  const dropCard = (key, toLane) => {
    const card = cards.find((c) => cardKey(c) === key);
    if (card && card.lane !== toLane) send(card, toLane, '');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, fontSize: T.fsSmall, color: T.textMuted }}>
        {jobsInWork} job{jobsInWork === 1 ? '' : 's'} in work · {canHandOff ? 'tap a card to hand it on, or drag it to a lane' : 'view only'}
      </p>
      {isError && (
        <p role="status" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10, fontSize: T.fsSmall, color: T.warn }}>
          Could not refresh — showing the board from {new Date(dataUpdatedAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}.
          <Button style={{ height: 44 }} onClick={() => refetch()}>Try again</Button>
        </p>
      )}
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
        {lanes.map((lane) => (
          <ProductionLane
            key={lane.key}
            lane={lane}
            canHandOff={canHandOff}
            onOpenCard={(card) => setOpenKey(cardKey(card))}
            onDropCard={dropCard}
          />
        ))}
      </div>
      {open && (
        <HandOffSheet
          card={open}
          lanes={board.lanes}
          holders={board.holders ?? []}
          canHandOff={canHandOff}
          busy={handOff.isPending}
          onHandOff={(toLane, holder) => send(open, toLane, holder)}
          onOpenJob={(jobId) => { setOpenKey(null); onOpenJob?.(jobId); }}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}
