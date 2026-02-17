import { useTranslation } from '../i18n';

type Step = 'cart' | 'email' | 'payment';

type CheckoutStepsProps = {
  currentStep: Step;
};

const steps: Step[] = ['cart', 'email', 'payment'];

function DesktopSteps({ currentStep }: CheckoutStepsProps) {
  const { t } = useTranslation();
  const currentIndex = steps.indexOf(currentStep);

  return (
    <ol className="flex items-center justify-center gap-2 sm:gap-4">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <li key={step} className="flex items-center" {...(isCurrent ? { 'aria-current': 'step' as const } : {})}>
            {index > 0 && (
              <div className={`h-px w-8 sm:w-12 mx-2 ${isCompleted ? 'bg-brand' : 'bg-neutral-300'}`} />
            )}
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  isCompleted
                    ? 'bg-brand text-white'
                    : isCurrent
                      ? 'border-2 border-brand text-brand'
                      : 'border-2 border-neutral-300 text-muted'
                }`}
              >
                {isCompleted ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={`text-sm font-medium ${
                  isCurrent ? 'text-primary' : isCompleted ? 'text-brand' : 'text-muted'
                }`}
              >
                {t(`checkout.steps.${step}`)}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function MobileSteps({ currentStep }: CheckoutStepsProps) {
  const { t } = useTranslation();
  const currentIndex = steps.indexOf(currentStep);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Step name */}
      <span className="text-sm font-semibold text-primary">
        {t('checkout.stepOf', { current: String(currentIndex + 1), total: String(steps.length) })}
        {' — '}
        {t(`checkout.steps.${currentStep}`)}
      </span>

      {/* Dot indicators */}
      <div className="flex items-center gap-2">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <li key={step} className="flex items-center" {...(isCurrent ? { 'aria-current': 'step' as const } : {})}>
              {index > 0 && (
                <div className={`h-px w-8 sm:w-12 mx-2 ${isCompleted ? 'bg-brand' : 'bg-neutral-300'}`} />
              )}
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    isCompleted
                      ? 'bg-brand text-white'
                      : isCurrent
                        ? 'border-2 border-brand text-brand'
                        : 'border-2 border-neutral-300 text-secondary'
                  }`}
                >
                  {isCompleted ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={`text-xs sm:text-sm font-medium ${
                    isCurrent ? 'text-primary' : isCompleted ? 'text-brand' : 'text-secondary'
                  }`}
                >
                  {t(`checkout.steps.${step}`)}
                </span>
              </div>
            </li>
          );
        })}
      </div>
    </div>
  );
}

export default function CheckoutSteps({ currentStep }: CheckoutStepsProps) {
  return (
    <nav aria-label="Checkout steps" className="mb-8">
      {/* Desktop: full step indicator */}
      <div className="hidden sm:block">
        <DesktopSteps currentStep={currentStep} />
      </div>

      {/* Mobile: compact dot indicator */}
      <div className="sm:hidden">
        <MobileSteps currentStep={currentStep} />
      </div>
    </nav>
  );
}
