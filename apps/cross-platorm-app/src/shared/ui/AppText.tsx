import { H1, Paragraph, Text, TextProps } from 'tamagui';

export function PageTitle(props: TextProps) {
  return <H1 color="$color" size="$9" {...props} />;
}

export function SectionTitle(props: TextProps) {
  return <Text color="$color" fontSize="$7" fontWeight="700" {...props} />;
}

export function BodyText(props: TextProps) {
  return <Paragraph color="$color11" lineHeight="$5" {...props} />;
}
