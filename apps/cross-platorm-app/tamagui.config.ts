import { defaultConfig } from '@tamagui/config/v5';
import { createTamagui } from 'tamagui';

export const tamaguiConfig = createTamagui(defaultConfig);

export default tamaguiConfig;

export type TamaguiAppConfig = typeof tamaguiConfig;

declare module 'tamagui' {
  // Tamagui uses declaration merging here to infer app-specific tokens.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface
  interface TamaguiCustomConfig extends TamaguiAppConfig {}
}
