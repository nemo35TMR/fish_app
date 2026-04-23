class CreateFishLures < ActiveRecord::Migration[8.1]
  def change
    create_table :fish_lures do |t|
      t.references :fish_species, null: false, foreign_key: true
      t.references :lure, null: false, foreign_key: true

      t.timestamps
    end
  end
end
