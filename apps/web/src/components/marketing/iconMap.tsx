import type { ComponentType, SVGProps } from 'react';

import {
  AirIcon,
  BadgeCheckIcon,
  CalendarIcon,
  CameraIcon,
  ClockIcon,
  HardHatIcon,
  HomeIcon,
  LeafIcon,
  ListIcon,
  MedicalIcon,
  OfficeIcon,
  PestIcon,
  PhonePayIcon,
  RugIcon,
  ShieldIcon,
  SofaIcon,
  SparkleIcon,
  StarIcon,
  TagIcon,
} from '../icons';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/** Maps the icon keys used in content/site.ts to their components. */
export const ICONS: Record<string, Icon> = {
  home: HomeIcon,
  office: OfficeIcon,
  medical: MedicalIcon,
  hardhat: HardHatIcon,
  sofa: SofaIcon,
  rug: RugIcon,
  pest: PestIcon,
  air: AirIcon,
  shield: ShieldIcon,
  badge: BadgeCheckIcon,
  tag: TagIcon,
  leaf: LeafIcon,
  clock: ClockIcon,
  camera: CameraIcon,
  list: ListIcon,
  calendar: CalendarIcon,
  pay: PhonePayIcon,
  sparkle: SparkleIcon,
  star: StarIcon,
};

export function Icon({ name, ...props }: { name: string } & SVGProps<SVGSVGElement>) {
  const Component = ICONS[name] ?? SparkleIcon;
  return <Component {...props} />;
}
