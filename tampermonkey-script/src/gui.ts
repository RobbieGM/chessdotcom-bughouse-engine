import { h, render, FunctionComponent } from "preact";
import { useState } from "preact/hooks";
import { EventBus } from "light-event-bus";
import htm from "htm";

const html = htm.bind(h);

interface Props {
  onSittingStatusChange: (sitting: boolean) => void;
}

const GUIComponent: FunctionComponent<Props> = ({ onSittingStatusChange }) => {
  const [sitting, setSitting] = useState(false);
  return html`<button
    onClick=${() => {
      onSittingStatusChange(!sitting);
      setSitting(!sitting);
    }}
  >
    ${sitting ? "Move" : "Sit"}
  </button>` as any;
};

export default class GUI {
  events = new EventBus<{ sittingstatuschange: boolean }>();
  constructor() {
    const adContainer = document.getElementById("board-layout-ad")!;
    adContainer.style.display = "block";
    render(
      html`<${GUIComponent}
        onSittingStatusChange=${(sitting: boolean) =>
          this.events.publish("sittingstatuschange", sitting)}
      />`,
      adContainer
    );
  }
}
