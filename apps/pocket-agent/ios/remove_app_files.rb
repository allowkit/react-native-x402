# Undo the earlier app-target integration: the Nitro module now builds as a
# local pod (X402SignerModule.podspec), so the app target must not compile
# the same sources (duplicate symbols) or carry the custom interop settings.
require 'xcodeproj'
project = Xcodeproj::Project.open('PocketAgent.xcodeproj')
target = project.targets.find { |t| t.name == 'PocketAgent' }

%w[X402Signer NitroGenerated].each do |name|
  group = project.main_group.find_subpath(name, false)
  next unless group
  group.files.each do |ref|
    target.source_build_phase.files.each do |bf|
      bf.remove_from_project if bf.file_ref == ref
    end
    ref.remove_from_project
  end
  group.remove_from_project
end

target.build_configurations.each do |config|
  config.build_settings.delete('SWIFT_OBJC_INTEROP_MODE')
  config.build_settings.delete('CLANG_CXX_LANGUAGE_STANDARD')
  config.build_settings.delete('HEADER_SEARCH_PATHS')
end

project.save
puts 'app-target nitro files and settings removed'
