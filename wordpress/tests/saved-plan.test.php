<?php
declare(strict_types=1);
// Reuse the real SQLite history harness, then exercise a separate plan conversation.
require __DIR__ . '/chat-history-sqlite.test.php';
require __DIR__ . '/../src/Chat/SavedPlan.php';
use PixflowDesign\WordPress\Chat\SavedPlan;
use PixflowDesign\WordPress\Chat\HistoryRepository;
$history->migrate(['uuid' => 'project-1', 'title' => 'Plan test', 'metadata' => []], 'plan-test');
$plan = ['id' => 'site-build', 'revision' => 0, 'title' => 'Build service page', 'summary' => 'Explain fitting and alignment; retain approved colours.', 'steps' => [
    ['id' => 'outline', 'content' => 'Agree content coverage', 'status' => 'completed'],
    ['id' => 'build', 'content' => 'Build the page', 'status' => 'in_progress'],
    ['id' => 'verify', 'content' => 'Verify desktop and mobile', 'status' => 'pending'],
]];
$first = $history->write('project-1', 'plan-test', SavedPlan::message(SavedPlan::validate($plan), null));
history_sqlite_check(!is_wp_error($first), 'Plan saved');
$reloaded = (new HistoryRepository())->message('project-1', 'plan-test', SavedPlan::MESSAGE_ID);
history_sqlite_check(SavedPlan::from_message($reloaded)['summary'] === $plan['summary'], 'Reload retains outline');
$plan['revision'] = $reloaded['historyRevision'];
$plan['steps'][1]['status'] = 'completed'; $plan['steps'][2]['status'] = 'in_progress';
$next = $history->write('project-1', 'plan-test', SavedPlan::message($plan, $reloaded));
history_sqlite_check(!is_wp_error($next), 'Progress saved');
$stale = $plan; $stale['steps'][2]['status'] = 'completed';
history_sqlite_check(is_wp_error($history->write('project-1', 'plan-test', SavedPlan::message($stale, $reloaded))), 'Stale recovered run cannot overwrite progress');
$destination = new HistoryRepository();
history_sqlite_check(SavedPlan::from_message($destination->message('project-1', 'plan-test', SavedPlan::MESSAGE_ID))['steps'][2]['status'] === 'in_progress', 'Handoff to same conversation retains unfinished verification');
history_sqlite_check($destination->message('project-1', 'another-chat', SavedPlan::MESSAGE_ID) === null, 'Other chats do not inherit the plan');
$bad = $plan; $bad['steps'][0]['status'] = 'in_progress';
try { SavedPlan::validate($bad); throw new RuntimeException('Multiple active steps accepted'); } catch (InvalidArgumentException $expected) {}
$history->remove('project-1', 'plan-test');
history_sqlite_check($destination->message('project-1', 'plan-test', SavedPlan::MESSAGE_ID) === null, 'Chat deletion removes plan');
echo "Saved plan persistence, progress, recovery, handoff identity and deletion passed.\n";
