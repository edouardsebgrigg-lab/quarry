// Cab shortcut: pick a compatible tool directly without leaving the machine or cycling tools.
import { el, kbd } from '../dom.js';
import { getMachine, machineName } from '../../machinery/index.js';
import { diggerToolChoices } from './diggerToolChoices.js';

export function openDiggerTools(overlays, { game, world, feedback }) {
  const read = () => {
    const info = world?.hudInfo();
    const machine = getMachine(game.ctx, game.state.player.driving);
    const inCab = info?.mode === 'digger' || info?.mode === 'digger-direct';
    return { machine, ...diggerToolChoices(game.data, inCab ? machine : null, { busy: !!info?.machine?.attachmentBusy }) };
  };
  const initial = read();
  if (!initial.choices.length) {
    feedback?.message(initial.reason, 'info');
    return null;
  }
  return overlays.open({
    id: 'digger-tools', title: 'Digger tools', className: 'overlay-digger-tools',
    build: ({ close, entry }) => {
      const identity = el('div', { class: 'dt-machine' }, machineName(game.data, initial.machine));
      const note = el('p', { class: 'dt-note' });
      const choices = el('div', { class: 'dt-choices', role: 'group', 'aria-label': 'Compatible digger tools' });
      let last = '';
      function refresh() {
        const state = read();
        const key = JSON.stringify([state.machine?.id, state.reason, state.choices]);
        if (key === last) return;
        last = key;
        note.textContent = state.reason ?? 'Choose a tool. Your machine stays here.';
        note.classList.toggle('blocked', !!state.reason);
        choices.replaceChildren(...state.choices.map(tool => el('button', {
          class: `dt-tool${tool.equipped ? ' equipped' : ''}`, disabled: tool.disabled,
          'aria-pressed': String(tool.equipped), dataset: { attachment: tool.id },
          onClick: () => {
            // Re-read the cab and ephemeral arm state before the authoritative game action.
            const current = read();
            const choice = current.choices.find(option => option.id === tool.id);
            if (current.machine?.id !== initial.machine.id || !choice || current.reason || choice.equipped) {
              feedback?.message(current.reason ?? 'Choose a tool for the digger you are in', 'warn');
              refresh();
              return;
            }
            const result = game.actions.setDiggerAttachment(initial.machine.id, tool.id);
            if (!result.ok) {
              feedback?.message(result.reason, 'warn');
              refresh();
              note.textContent = result.reason;
              note.classList.add('blocked');
              return;
            }
            feedback?.message(`${tool.name} fitted`, 'good');
            close();
          },
        }, el('span', { class: 'dt-tool-head' }, el('b', {}, tool.name), tool.equipped ? el('span', { class: 'dt-equipped' }, 'Equipped') : null),
        el('span', { class: 'dt-purpose' }, tool.purpose), el('span', { class: 'dt-specs' }, tool.specs))));
      }
      refresh();
      entry.update = refresh;
      return el('div', { class: 'dt-body' }, identity, note, choices,
        el('div', { class: 'dt-foot' }, kbd('Esc'), ' Close and return to the cab'));
    },
  });
}
