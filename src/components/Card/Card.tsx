import { forwardRef } from 'react';
import styles from './Card.module.css';
import type { CardProps } from './Card.types';

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'plain', className, children, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={`${styles.card} ${styles[variant]} ${className ?? ''}`} {...rest}>
      {children}
    </div>
  );
});
