// TODO: Sanitize string input of buckets

// Helper function returning a query that defines a variable events_active
// that can be used to filter away non-active time.
function events_active(afkbucket, audibleAsActive) {
  return [
    'events_active = [];',
    `events_afk = flood(query_bucket("${afkbucket}"));`,
    'events_active = period_union(events_active, filter_keyvals(events_afk, "status", ["not-afk"]));',
  ].concat(audibleAsActive ? [
    'events_audible = filter_keyvals(events_browser, "audible", [true]);',
    'events_active = period_union(events_active, events_audible);',
  ]);
}

function windowQuery(windowbucket, afkbucket, appcount, titlecount, filterAFK) {
  // TODO: Take into account audible browser activity (tricky)
  return [
    'events  = flood(query_bucket("' + windowbucket + '"));',
  ].concat(filterAFK ? [
    'not_afk = flood(query_bucket("' + afkbucket + '"));',
    'not_afk = filter_keyvals(not_afk, "status", ["not-afk"]);',
    'events  = filter_period_intersect(events, not_afk);',
  ] : []).concat([
    'title_events  = merge_events_by_keys(events, ["app", "title"]);',
    'title_events  = sort_by_duration(title_events);',
    'app_events  = merge_events_by_keys(title_events, ["app"]);',
    'app_events  = sort_by_duration(app_events);',

    'events = sort_by_timestamp(events);',
    'app_chunks = chunk_events_by_key(events, "app");',
    'app_events  = limit_events(app_events, ' + appcount + ');',
    'title_events  = limit_events(title_events, ' + titlecount + ');',
    'duration = sum_durations(events);',
    'RETURN  = {"app_events": app_events, "title_events": title_events, "app_chunks": app_chunks, "duration": duration};',
  ]);
}

function browserSummaryQuery(browserbucket, windowbucket, afkbucket, count, filterAFK, audibleAsActive) {
  var browser_appnames = "";
  if (browserbucket.endsWith("-chrome")){
    browser_appnames = '["Google-chrome", "chrome.exe", "Chromium", "Google Chrome"]';
  } else if (browserbucket.endsWith("-firefox")){
    browser_appnames = '["Firefox", "Firefox.exe", "firefox"]';
  }

  return [
    `events_browser = flood(query_bucket("${browserbucket}"));`,
    `events_window_browser = filter_keyvals(flood(query_bucket("${windowbucket}")), "app", ${browser_appnames});`,
  ].concat(filterAFK ? events_active(afkbucket, browserbucket, audibleAsActive))
  ].concat(filterAFK ? [
    'events_window_browser = filter_period_intersect(events_window_browser, events_active);',
  ] : [])
  .concat([
    'events = filter_period_intersect(events, events_window_browser);',
    'events = split_url_events(events);',
    'urls = merge_events_by_keys(events, ["domain", "url"]);',
    `urls = limit_events(sort_by_duration(urls), ${count});`,
    'domains = split_url_events(events);',
    'domains = merge_events_by_keys(domains, ["domain"]);',
    'domains = sort_by_duration(domains);',
    `domains = limit_events(domains, ${count});`,
    'chunks = chunk_events_by_key(events, "domain");',
    'duration = sum_durations(events);',
    'RETURN = {"domains": domains, "urls": urls, "chunks": chunks, "duration": duration};',
  ]);
}

function editorActivityQuery (editorbucket, limit){
  return [
    'editorbucket = "' + editorbucket + '";',
    'events = flood(query_bucket(editorbucket));',
    'files = sort_by_duration(merge_events_by_keys(events, ["file", "language"]));',
    `files = limit_events(files, ${limit});`,
    'languages = sort_by_duration(merge_events_by_keys(events, ["language"]));',
    `languages = limit_events(languages, ${limit});`,
    'projects = sort_by_duration(merge_events_by_keys(events, ["project"]));',
    `projects = limit_events(projects, ${limit});`,
    'duration = sum_durations(events);',
    'RETURN = {"files": files, "languages": languages, "projects": projects, "duration": duration};'
  ];
}

function dailyActivityQuery (afkbucket){
  return events_active().concat([
    'RETURN = events_active;'
  ]);
}

module.exports = {
    "windowQuery": windowQuery,
    "browserSummaryQuery": browserSummaryQuery,
    "editorActivityQuery": editorActivityQuery,
    "dailyActivityQuery": dailyActivityQuery,
}
