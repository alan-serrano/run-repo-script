type TtyState = {
  hadOwnValue: boolean;
  previousValue: boolean | undefined;
};

function setTty(
  stream: NodeJS.ReadStream | NodeJS.WriteStream,
  value: boolean
): TtyState {
  const hadOwnValue = Object.prototype.hasOwnProperty.call(stream, 'isTTY');
  const previousValue = stream.isTTY;

  Object.defineProperty(stream, 'isTTY', {
    value,
    configurable: true,
    writable: true
  });

  return { hadOwnValue, previousValue };
}

function restoreTty(
  stream: NodeJS.ReadStream | NodeJS.WriteStream,
  state: TtyState
): void {
  if (state.hadOwnValue) {
    Object.defineProperty(stream, 'isTTY', {
      value: state.previousValue,
      configurable: true,
      writable: true
    });
    return;
  }

  delete (stream as unknown as { isTTY?: boolean }).isTTY;
}

async function withTtyValue<T>(
  value: boolean,
  action: () => Promise<T>
): Promise<T> {
  const stdinState = setTty(process.stdin, value);
  const stdoutState = setTty(process.stdout, value);

  try {
    return await action();
  } finally {
    restoreTty(process.stdin, stdinState);
    restoreTty(process.stdout, stdoutState);
  }
}

export function withNonInteractiveTty<T>(action: () => Promise<T>): Promise<T> {
  return withTtyValue(false, action);
}

export function withInteractiveTty<T>(action: () => Promise<T>): Promise<T> {
  return withTtyValue(true, action);
}
