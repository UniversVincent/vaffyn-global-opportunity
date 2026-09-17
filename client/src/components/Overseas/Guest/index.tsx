import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowUp,
  Mic,
  SquarePen,
  UserRound,
  Settings2,
  X,
  Globe2,
  FileSearch,
  BriefcaseBusiness,
  Languages,
  LogOut,
  ChevronsUp,
} from 'lucide-react';
import {
  Button,
  IconButton,
  Textarea,
  ThemeSelector,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@librechat/client';
import { dataService, guestRequestSchema } from 'librechat-data-provider';
import type { GuestRequest, GuestReply, GuestHistoryEntry } from 'librechat-data-provider';
import type { ChatFormValues } from '~/common';
import { useGuestCapabilities, useGuestTurn, useGuestClear, useGuestState } from '~/data-provider';
import { ChatFormProvider } from '~/Providers/ChatFormContext';
import StarterList from '~/components/Chat/Input/StarterList';
import i18n, { normalizeLocale } from '~/locales/i18n';
import Language from '~/components/Nav/Language';
import useLocalize from '~/hooks/useLocalize';
import Brand from '~/components/Brand';
import useLocalRecording from './recording';
import Voice from './Voice';
import Auth from './Auth';
import MembershipDialog from './Membership';
import Profile from './Profile';

const textareaId = 'guest-message';
const emptyProfile = { revision: 0, entries: [] };
const noProposals: GuestReply['facts'] = [];

export default function Guest() {
  const localize = useLocalize();
  const capabilities = useGuestCapabilities();
  const account = useGuestState();
  const send = useGuestTurn();
  const clear = useGuestClear();
  const [search, setSearch] = useSearchParams();
  const methods = useForm<ChatFormValues>({ defaultValues: { text: '' } });
  const text = useWatch({ control: methods.control, name: 'text' });
  const recording = useLocalRecording();
  const discardRecording = recording.discard;
  const [turns, setTurns] = useState<GuestHistoryEntry[]>([]);
  const [dialog, setDialog] = useState<'login' | 'plans' | 'settings' | 'profile' | 'voice' | null>(
    search.has('membership') ? 'plans' : null,
  );
  const [notice, setNotice] = useState<'offline' | 'error' | 'limit' | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [proposals, setProposals] = useState<GuestReply['facts']>(noProposals);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const attempt = useRef<GuestRequest | null>(null);
  const inflight = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const previousUser = useRef<string | null | undefined>(undefined);
  const preserveGuestDraft = useRef(false);
  const busy = send.isLoading || clear.isLoading || transitioning;
  const membership = account.data?.membership ?? 'guest';
  const signedIn = Boolean(account.data?.username);
  const remaining = account.data?.remaining ?? 5;
  const starters = [
    {
      label: localize('com_ui_flow_start_work'),
      text: localize('com_ui_flow_prompt_work'),
      icon: Globe2,
    },
    {
      label: localize('com_ui_flow_start_policy'),
      text: localize('com_ui_flow_prompt_policy'),
      icon: FileSearch,
    },
    {
      label: localize('com_ui_flow_start_career'),
      text: localize('com_ui_flow_prompt_career'),
      icon: BriefcaseBusiness,
    },
    {
      label: localize('com_ui_flow_start_language'),
      text: localize('com_ui_flow_prompt_language'),
      icon: Languages,
    },
  ];

  useEffect(() => {
    if (!account.data) return;
    if (previousUser.current !== undefined && previousUser.current !== account.data.username) {
      if (previousUser.current !== null || !preserveGuestDraft.current) methods.reset({ text: '' });
      preserveGuestDraft.current = false;
      setProposals(noProposals);
      setReviewed([]);
      discardRecording();
      attempt.current = null;
    }
    previousUser.current = account.data.username;
    setTurns(account.data.history);
    setReviewed(account.data.reviewedRequests);
  }, [account.data, methods, discardRecording]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [turns.length]);
  useEffect(() => {
    if (!text.trim() && recording.state === 'idle') return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [text, recording.state]);

  const close = () => {
    setDialog(null);
    if (search.has('membership')) setSearch({}, { replace: true });
  };
  const submit = async () => {
    if (busy || inflight.current || !text.trim()) return;
    setNotice(null);
    if (remaining === 0) {
      setDialog(signedIn ? 'plans' : 'login');
      return;
    }
    if (!capabilities.data?.chatAvailable) {
      setNotice('offline');
      return;
    }
    const locale = normalizeLocale(i18n.language);
    const input = {
      text: text.trim(),
      locale: locale === 'zh-Hant' || locale === 'en' ? locale : 'zh-Hans',
      mode: 'basic',
      attachments: [],
    };
    const previous = attempt.current;
    const candidate = { requestId: previous?.requestId ?? crypto.randomUUID(), ...input };
    if (previous && JSON.stringify(candidate) !== JSON.stringify(previous))
      candidate.requestId = crypto.randomUUID();
    const parsed = guestRequestSchema.safeParse(candidate);
    if (!parsed.success) {
      setNotice('limit');
      return;
    }
    attempt.current = parsed.data;
    inflight.current = true;
    try {
      const outcome = await send.mutateAsync(parsed.data);
      if (outcome.status === 'reply') {
        setTurns((previousTurns) => [
          ...previousTurns,
          { request: parsed.data, reply: outcome.reply },
        ]);
        methods.reset({ text: '' });
        attempt.current = null;
        await account.refetch();
      } else if (outcome.status === 'sign_in_required') setDialog('login');
      else if (['daily_limit', 'feature_locked', 'deep_locked'].includes(outcome.status))
        setDialog('plans');
      else setNotice('error');
    } catch {
      setNotice('error');
    } finally {
      inflight.current = false;
    }
  };
  const reset = async () => {
    try {
      await clear.mutateAsync();
      methods.reset({ text: '' });
      attempt.current = null;
      setTurns([]);
      setReviewed([]);
      setNotice(null);
      recording.discard();
      await account.refetch();
    } catch {
      setNotice('error');
    } finally {
      setConfirmClear(false);
    }
  };
  const logout = async () => {
    setTransitioning(true);
    try {
      await dataService.guestLogout();
      methods.reset({ text: '' });
      setTurns([]);
      setProposals([]);
      setReviewed([]);
      recording.discard();
      attempt.current = null;
      await account.refetch();
      close();
    } catch {
      setNotice('error');
    } finally {
      setTransitioning(false);
    }
  };
  const fill = (value: string) => {
    const draft = methods.getValues('text');
    methods.setValue('text', draft.trim() ? `${draft}\n${value}` : value, { shouldDirty: true });
    document.getElementById(textareaId)?.focus();
  };
  const showProfile = () => {
    void account.refetch();
    setProposals(noProposals);
    setDialog('profile');
  };
  const statusText =
    notice === 'offline' ? localize('com_ui_flow_offline') : localize('com_ui_guest_send_error');
  const noticeText = notice === 'limit' ? localize('com_ui_guest_input_limit') : statusText;

  return (
    <ChatFormProvider {...methods}>
      <div className="flex min-h-dvh flex-col bg-surface-primary text-text-primary">
        <header className="flex min-h-16 items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Brand />
            <IconButton
              label={localize('com_ui_new_chat')}
              disabled={busy}
              onClick={() => (turns.length || text.trim() ? setConfirmClear(true) : reset())}
            >
              <SquarePen className="size-4" />
            </IconButton>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <IconButton
              label={localize('com_ui_flow_profile')}
              onClick={showProfile}
              disabled={busy}
            >
              <UserRound className="size-4" />
            </IconButton>
            <IconButton
              label={localize('com_ui_flow_settings')}
              onClick={() => setDialog('settings')}
            >
              <Settings2 className="size-4" />
            </IconButton>
            {signedIn ? (
              <Button size="sm" variant="outline" onClick={() => setDialog('plans')}>
                {localize(`com_ui_flow_plan_${membership === 'guest' ? 'free' : membership}`)}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setDialog('login')}>
                {localize('com_auth_login')}
              </Button>
            )}
          </div>
        </header>
        <main
          className={`mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-4 sm:px-6 ${turns.length ? 'gap-6 pt-6' : 'justify-center gap-7 pb-20'}`}
        >
          {!turns.length && (
            <h1 className="text-center text-2xl font-medium sm:text-3xl">
              {localize('com_ui_flow_title')}
            </h1>
          )}
          {!!turns.length && (
            <div
              role="log"
              aria-label={localize('com_ui_guest_conversation')}
              aria-live="polite"
              className="flex flex-1 flex-col gap-8 pb-5"
            >
              {turns.map((turn, index) => (
                <section key={turn.request.requestId} className="flex min-w-0 flex-col gap-5">
                  <p className="ml-auto max-w-[90%] whitespace-pre-wrap break-words rounded-lg bg-surface-secondary px-4 py-3 leading-7">
                    {turn.request.text}
                  </p>
                  <div className="flex min-w-0 flex-col gap-4 leading-7">
                    <p className="whitespace-pre-wrap break-words">{turn.reply.summary}</p>
                    {turn.reply.questions.map((question) => (
                      <div key={question.field} className="flex flex-col gap-2">
                        <p>{question.text}</p>
                        <div className="flex flex-wrap gap-2">
                          {question.examples.map((example) => (
                            <Button
                              key={example}
                              variant="outline"
                              size="sm"
                              className="h-auto min-h-10 whitespace-normal py-2 text-left"
                              disabled={busy}
                              onClick={() => fill(example)}
                            >
                              {example}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {!!turn.reply.facts.length &&
                      index === turns.length - 1 &&
                      !reviewed.includes(turn.request.requestId) && (
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <span className="text-text-secondary">
                            {localize('com_ui_flow_facts_notice')}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setProposals(turn.reply.facts);
                              setDialog('profile');
                            }}
                          >
                            {localize('com_ui_flow_review_facts')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              try {
                                const result = await dataService.dismissGuestProposal(
                                  turn.request.requestId,
                                );
                                if (result.status !== 'ok') {
                                  setNotice('error');
                                  return;
                                }
                                setReviewed([...reviewed, turn.request.requestId]);
                                await account.refetch();
                              } catch {
                                setNotice('error');
                              }
                            }}
                          >
                            {localize('com_ui_flow_not_now')}
                          </Button>
                        </div>
                      )}
                    {turn.reply.kind === 'professional_boundary' && (
                      <p className="text-sm text-text-secondary">
                        {localize('com_ui_guest_boundary')}
                      </p>
                    )}
                    {turn.reply.kind === 'ready' && (
                      <p className="text-sm text-text-secondary">
                        {localize('com_ui_flow_research_pending')}
                      </p>
                    )}
                  </div>
                </section>
              ))}
              <div ref={end} />
            </div>
          )}
          <div
            className={
              turns.length
                ? 'sticky bottom-0 flex flex-col gap-3 bg-surface-primary pb-3 pt-2'
                : 'flex flex-col gap-5'
            }
          >
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div className="overflow-hidden rounded-lg border border-border-light bg-surface-secondary">
                <label htmlFor={textareaId} className="sr-only">
                  {localize('com_ui_message_input')}
                </label>
                <Textarea
                  variant="composer"
                  {...methods.register('text')}
                  id={textareaId}
                  rows={3}
                  maxLength={4000}
                  className="max-h-64 min-h-28"
                  disabled={busy}
                  placeholder={localize('com_ui_flow_placeholder')}
                  autoComplete="off"
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing &&
                      window.matchMedia('(pointer: fine)').matches
                    ) {
                      event.preventDefault();
                      void submit();
                    }
                  }}
                />
                <div className="flex items-center justify-between gap-3 px-2 pb-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <IconButton
                      label={localize('com_ui_guest_voice')}
                      disabled={busy}
                      onClick={() => setDialog('voice')}
                    >
                      <Mic className="size-5" />
                    </IconButton>
                    <span className="text-xs text-text-secondary">
                      {localize(
                        signedIn ? 'com_ui_flow_daily_remaining' : 'com_ui_flow_guest_remaining',
                        { count: remaining },
                      )}
                    </span>
                  </div>
                  <Button
                    type="submit"
                    size="icon"
                    aria-label={localize('com_nav_send_message')}
                    disabled={busy || !text.trim() || account.isLoading}
                  >
                    <ArrowUp className="size-5" />
                  </Button>
                </div>
              </div>
              {(notice || busy) && (
                <p role="status" className="text-sm text-text-secondary">
                  {busy ? localize('com_ui_loading') : noticeText}
                </p>
              )}
              {!capabilities.isLoading && !capabilities.data?.chatAvailable && !notice && !busy && (
                <p role="status" className="text-xs text-text-secondary">
                  {localize('com_ui_flow_offline')}
                </p>
              )}
              {remaining === 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <p>
                    {localize(
                      signedIn ? 'com_ui_flow_daily_exhausted' : 'com_ui_flow_guest_exhausted',
                    )}
                  </p>
                  <Button size="sm" onClick={() => setDialog(signedIn ? 'plans' : 'login')}>
                    {localize(signedIn ? 'com_ui_flow_membership' : 'com_ui_guest_continue_login')}
                  </Button>
                </div>
              )}
            </form>
            {!turns.length && (
              <StarterList compact starters={starters} textareaId={textareaId} disabled={busy} />
            )}
          </div>
        </main>
        <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-3 text-xs text-text-secondary">
          <span>{localize('com_ui_flow_footer')}</span>
          <Button size="sm" variant="ghost" onClick={() => setDialog('plans')}>
            <ChevronsUp className="mr-1 size-4" />
            {localize('com_ui_flow_membership')}
          </Button>
        </footer>
        <Auth
          open={dialog === 'login'}
          onClose={close}
          onSuccess={() => {
            preserveGuestDraft.current = !signedIn;
            setTurns([]);
            setProposals([]);
            setReviewed([]);
            recording.discard();
            attempt.current = null;
            void account.refetch();
          }}
        />
        <MembershipDialog
          open={dialog === 'plans'}
          onClose={close}
          membership={membership}
          onLogin={() => setDialog('login')}
        />
        <Profile
          open={dialog === 'profile'}
          onClose={close}
          profile={account.data?.profile ?? emptyProfile}
          proposals={proposals}
          signedIn={signedIn}
          onSaved={() => {
            setReviewed(turns.map((turn) => turn.request.requestId));
            setProposals(noProposals);
            void account.refetch();
          }}
        />
        <Voice
          open={dialog === 'voice'}
          onOpenChange={(open) => {
            if (!open) close();
          }}
          recording={recording}
        />
        <Dialog
          open={dialog === 'settings'}
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto" showCloseButton={false}>
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>{localize('com_ui_flow_settings')}</DialogTitle>
                <IconButton label={localize('com_ui_close')} onClick={close}>
                  <X className="size-4" />
                </IconButton>
              </div>
              <DialogDescription>{localize('com_ui_flow_preferences')}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-5 px-6 pb-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm">{localize('com_nav_language')}</span>
                <Language portal={false} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">{localize('com_nav_theme')}</span>
                <ThemeSelector returnThemeOnly />
              </div>
              {signedIn && (
                <>
                  <p className="break-all text-sm">{account.data?.username}</p>
                  <Button variant="outline" disabled={busy} onClick={logout}>
                    <LogOut className="mr-2 size-4" />
                    {localize('com_ui_flow_logout')}
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
        <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{localize('com_ui_new_chat')}</AlertDialogTitle>
              <AlertDialogDescription>
                {localize('com_ui_flow_clear_notice')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{localize('com_ui_cancel')}</AlertDialogCancel>
              <Button disabled={busy} onClick={reset}>
                {localize('com_ui_clear')}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ChatFormProvider>
  );
}
