import { Button, ButtonProps } from 'tamagui';

export function AppButton(props: ButtonProps) {
  return <Button fontWeight="700" rounded="$4" {...props} />;
}
